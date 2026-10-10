import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Observable } from "rxjs";
import type { LiveQuote } from "@chartmate/shared";

import { InstrumentsService } from "./instruments.service";
import { MarketDataService } from "./market.service";

/** Как часто поток отдаёт накопившиеся изменения клиенту. */
const EMIT_INTERVAL_MS = 1_000;

/**
 * Шаг опроса для классов активов без потокового источника. Бесплатный тариф
 * Twelve Data — 8 запросов в минуту, поэтому чаще опрашивать нельзя: ключ
 * выгорит за минуты. Биржевая цена акции у них всё равно обновляется реже.
 */
const POLL_INTERVAL_MS = 15_000;

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
/** Держим сокет открытым после ухода последнего подписчика — переключение инструмента не рвёт поток. */
const IDLE_CLOSE_DELAY_MS = 30_000;

interface BinanceTickerPayload {
  stream?: string;
  data?: { s?: string; c?: string; P?: string; E?: number };
}

@Injectable()
export class LiveQuotesService implements OnModuleDestroy {
  private readonly logger = new Logger(LiveQuotesService.name);
  /** Последняя известная котировка по символу — общая на всех подписчиков. */
  private readonly quotes = new Map<string, LiveQuote>();

  private socket: WebSocket | null = null;
  private reconnectDelay = RECONNECT_BASE_MS;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private cryptoSubscribers = 0;
  private shuttingDown = false;

  constructor(
    private readonly config: ConfigService,
    private readonly instruments: InstrumentsService,
    private readonly marketData: MarketDataService,
  ) {}

  onModuleDestroy(): void {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.socket?.close();
    this.socket = null;
  }

  /**
   * Поток котировок по списку символов. Сначала отдаёт текущий снимок, дальше —
   * только изменившиеся значения, не чаще раза в секунду.
   */
  stream(symbols: string[]): Observable<LiveQuote[]> {
    return new Observable<LiveQuote[]>((subscriber) => {
      const sent = new Map<string, number>();
      let emitTimer: NodeJS.Timeout | null = null;
      let pollTimer: NodeJS.Timeout | null = null;
      let releaseCrypto: (() => void) | null = null;
      let stopped = false;

      const flush = () => {
        const batch: LiveQuote[] = [];
        for (const symbol of symbols) {
          const quote = this.quotes.get(symbol);
          if (quote && sent.get(symbol) !== quote.price) {
            sent.set(symbol, quote.price);
            batch.push(quote);
          }
        }
        if (batch.length) subscriber.next(batch);
      };

      void this.resolve(symbols)
        .then(({ crypto, polled }) => {
          if (stopped) return;

          if (crypto.length) releaseCrypto = this.retainCryptoFeed();

          if (polled.length) {
            const poll = () => void this.pollOnce(polled);
            poll();
            pollTimer = setInterval(poll, POLL_INTERVAL_MS);
          }

          flush();
          emitTimer = setInterval(flush, EMIT_INTERVAL_MS);
        })
        .catch((err: unknown) => subscriber.error(err));

      return () => {
        stopped = true;
        if (emitTimer) clearInterval(emitTimer);
        if (pollTimer) clearInterval(pollTimer);
        releaseCrypto?.();
      };
    });
  }

  /** Разносит запрошенные символы по способу получения цены. Неизвестные тихо отбрасываются. */
  private async resolve(symbols: string[]): Promise<{ crypto: string[]; polled: string[] }> {
    const known = await this.instruments.listAll();
    const bySymbol = new Map(known.map((i) => [i.symbol, i]));
    const crypto: string[] = [];
    const polled: string[] = [];

    for (const symbol of symbols) {
      const instrument = bySymbol.get(symbol);
      if (!instrument) continue;
      (instrument.assetClass === "CRYPTO" ? crypto : polled).push(instrument.symbol);
    }
    return { crypto, polled };
  }

  private async pollOnce(symbols: string[]): Promise<void> {
    for (const symbol of symbols) {
      try {
        const quote = await this.marketData.getQuote(symbol);
        this.quotes.set(symbol, {
          symbol,
          assetClass: quote.assetClass,
          price: quote.price,
          changePercent: quote.changePercent,
          asOf: quote.asOf,
          source: "PROVIDER_POLL",
        });
      } catch (err) {
        // Нет ключа провайдера или он ответил ошибкой: пропускаем символ,
        // клиент продолжает видеть последнюю известную цену, а не выдуманную.
        this.logger.debug(`Не удалось опросить ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private retainCryptoFeed(): () => void {
    this.cryptoSubscribers += 1;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    void this.ensureSocket();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.cryptoSubscribers -= 1;
      if (this.cryptoSubscribers <= 0) {
        this.cryptoSubscribers = 0;
        this.idleTimer = setTimeout(() => this.closeSocket(), IDLE_CLOSE_DELAY_MS);
      }
    };
  }

  private closeSocket(): void {
    this.idleTimer = null;
    if (this.cryptoSubscribers > 0) return;
    this.socket?.close();
    this.socket = null;
  }

  private async ensureSocket(): Promise<void> {
    if (this.socket || this.shuttingDown) return;

    const instruments = await this.instruments.listAll();
    const streams = instruments
      .filter((i) => i.assetClass === "CRYPTO")
      .map((i) => `${i.symbol.toLowerCase()}@ticker`);
    if (!streams.length) return;

    // Повторная проверка: пока ждали список, сокет мог открыть параллельный вызов.
    if (this.socket || this.shuttingDown) return;

    const base = this.config.get<string>("BINANCE_WS_URL") || "wss://stream.binance.com:9443";
    const socket = new WebSocket(`${base}/stream?streams=${streams.join("/")}`);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.reconnectDelay = RECONNECT_BASE_MS;
      this.logger.log(`Поток котировок Binance открыт: ${streams.length} символов`);
    });

    socket.addEventListener("message", (event: MessageEvent) => {
      this.handleTicker(event.data);
    });

    socket.addEventListener("error", () => {
      this.logger.warn("Ошибка потока котировок Binance");
    });

    socket.addEventListener("close", () => {
      if (this.socket === socket) this.socket = null;
      if (this.shuttingDown || this.cryptoSubscribers <= 0) return;
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(delay * 2, RECONNECT_MAX_MS);
    this.logger.warn(`Переподключение к Binance через ${delay} мс`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureSocket();
    }, delay);
  }

  private handleTicker(raw: unknown): void {
    if (typeof raw !== "string") return;
    let payload: BinanceTickerPayload;
    try {
      payload = JSON.parse(raw) as BinanceTickerPayload;
    } catch {
      return;
    }

    const data = payload.data;
    if (!data?.s || data.c === undefined) return;

    const price = Number(data.c);
    const changePercent = data.P === undefined ? null : Number(data.P);
    if (!Number.isFinite(price)) return;

    this.quotes.set(data.s, {
      symbol: data.s,
      assetClass: "CRYPTO",
      price,
      changePercent: changePercent !== null && Number.isFinite(changePercent) ? changePercent : null,
      asOf: new Date(data.E ?? Date.now()).toISOString(),
      source: "BINANCE_WS",
    });
  }
}

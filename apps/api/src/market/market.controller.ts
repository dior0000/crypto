import { Controller, Get, Query, Sse, UseGuards } from "@nestjs/common";
import type { MessageEvent } from "@nestjs/common";
import type { Observable } from "rxjs";
import { map } from "rxjs/operators";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { InstrumentsService } from "./instruments.service";
import { LiveQuotesService } from "./live-quotes.service";
import { MarketDataService } from "./market.service";

/** Ограничение на подписку, чтобы один клиент не тянул весь каталог. */
const MAX_STREAM_SYMBOLS = 50;

@Controller("api/market")
@UseGuards(JwtAuthGuard)
export class MarketController {
  constructor(
    private readonly instruments: InstrumentsService,
    private readonly marketData: MarketDataService,
    private readonly liveQuotes: LiveQuotesService,
  ) {}

  @Get("instruments")
  async searchInstruments(@Query("q") query = "") {
    if (!query.trim()) return this.instruments.listAll();
    return this.instruments.search(query);
  }

  @Get("quote")
  async getQuote(@Query("symbol") symbol: string) {
    return this.marketData.getQuote(symbol);
  }

  /** Поток цен по списку символов: крипта — раз в секунду из WebSocket Binance. */
  @Sse("stream")
  streamQuotes(@Query("symbols") symbols = ""): Observable<MessageEvent> {
    const requested = symbols
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, MAX_STREAM_SYMBOLS);

    return this.liveQuotes.stream(requested).pipe(map((quotes) => ({ data: quotes })));
  }

  @Get("ohlcv")
  async getOhlcv(@Query("symbol") symbol: string, @Query("timeframe") timeframe: string) {
    return this.marketData.getOhlcv(symbol, timeframe);
  }
}

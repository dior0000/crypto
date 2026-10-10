import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CoinOverview } from "@chartmate/shared";

import { AppError, APP_ERROR_CODE } from "../common/errors/app-error";
import { InstrumentsService } from "./instruments.service";

/**
 * Публичный CoinGecko не требует ключа, но ограничивает частоту запросов,
 * поэтому ответ держим в памяти минуту. Таблица обновляется не чаще —
 * капитализация и объём за сутки так часто и не меняются; цена в строках
 * всё равно перекрывается живым потоком Binance на клиенте.
 */
const CACHE_TTL_MS = 60_000;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

interface CoinGeckoRow {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number | null;
  market_cap: number | null;
  market_cap_rank: number | null;
  total_volume: number | null;
  circulating_supply: number | null;
  price_change_percentage_1h_in_currency?: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  sparkline_in_7d?: { price?: number[] };
}

@Injectable()
export class CoinOverviewService {
  private readonly logger = new Logger(CoinOverviewService.name);
  private cache: { at: number; limit: number; rows: CoinOverview[] } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly instruments: InstrumentsService,
  ) {}

  async list(limit = DEFAULT_LIMIT): Promise<CoinOverview[]> {
    const size = Math.min(Math.max(1, limit), MAX_LIMIT);
    const fresh = this.cache && Date.now() - this.cache.at < CACHE_TTL_MS && this.cache.limit >= size;
    if (fresh && this.cache) return this.cache.rows.slice(0, size);

    try {
      const rows = await this.fetchRows(size);
      this.cache = { at: Date.now(), limit: size, rows };
      return rows;
    } catch (err) {
      // Отдаём прошлый снимок, если он есть: устаревшая на минуту таблица
      // полезнее пустого экрана, а цена в ней всё равно живая.
      if (this.cache) {
        this.logger.warn(`CoinGecko недоступен, отдаём кэш: ${err instanceof Error ? err.message : String(err)}`);
        return this.cache.rows.slice(0, size);
      }
      throw new AppError(
        APP_ERROR_CODE.MARKET_DATA_UNAVAILABLE,
        `Обзор рынка недоступен: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async fetchRows(size: number): Promise<CoinOverview[]> {
    const base = this.config.get<string>("COINGECKO_BASE_URL") || "https://api.coingecko.com";
    const url = new URL("/api/v3/coins/markets", base);
    url.searchParams.set("vs_currency", "usd");
    url.searchParams.set("order", "market_cap_desc");
    url.searchParams.set("per_page", String(size));
    url.searchParams.set("page", "1");
    url.searchParams.set("sparkline", "true");
    url.searchParams.set("price_change_percentage", "1h,24h,7d");

    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`CoinGecko вернул ${response.status}`);

    const raw = (await response.json()) as CoinGeckoRow[];
    const known = await this.instruments.listAll();
    const bySymbol = new Map(known.map((i) => [i.symbol.toUpperCase(), i.symbol]));

    return raw
      .filter((row) => typeof row.current_price === "number")
      .map((row) => {
        const ticker = `${row.symbol.toUpperCase()}USDT`;
        return {
          id: row.id,
          rank: row.market_cap_rank ?? null,
          symbol: row.symbol.toUpperCase(),
          name: row.name,
          image: row.image,
          tradingSymbol: bySymbol.get(ticker) ?? null,
          price: row.current_price as number,
          change1h: row.price_change_percentage_1h_in_currency ?? null,
          change24h: row.price_change_percentage_24h_in_currency ?? null,
          change7d: row.price_change_percentage_7d_in_currency ?? null,
          marketCap: row.market_cap ?? null,
          volume24h: row.total_volume ?? null,
          circulatingSupply: row.circulating_supply ?? null,
          // Точек за неделю приходит ~168 — для спарклайна хватает каждой четвёртой
          sparkline7d: (row.sparkline_in_7d?.price ?? []).filter((_, i) => i % 4 === 0),
        };
      });
  }
}

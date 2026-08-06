import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { OhlcvCandle } from "@chartmate/shared";

import { AppError, APP_ERROR_CODE } from "../../common/errors/app-error";
import type { NormalizedTimeframe } from "../timeframe";
import type { MarketDataProvider, Quote } from "./market-data-provider.interface";

const BINANCE_INTERVAL: Record<NormalizedTimeframe, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
  "1w": "1w",
};

const CANDLE_LIMIT = 200;

@Injectable()
export class BinanceProvider implements MarketDataProvider {
  readonly assetClass = "CRYPTO" as const;

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    // "||", не "??": пустая строка в .env (частый случай для незаполненного оверрайда)
    // тоже должна откатываться на дефолт, а не давать new URL(path, "") упасть.
    return this.config.get<string>("MARKET_DATA_BASE_URL") || "https://api.binance.com";
  }

  async getOhlcv(symbol: string, timeframe: NormalizedTimeframe): Promise<OhlcvCandle[]> {
    const url = new URL("/api/v3/klines", this.baseUrl);
    url.searchParams.set("symbol", symbol.toUpperCase());
    url.searchParams.set("interval", BINANCE_INTERVAL[timeframe]);
    url.searchParams.set("limit", String(CANDLE_LIMIT));

    const response = await fetch(url);
    if (!response.ok) {
      throw new AppError(APP_ERROR_CODE.MARKET_DATA_UNAVAILABLE, `Binance вернул ${response.status} для ${symbol}`);
    }

    const raw = (await response.json()) as unknown[][];
    return raw.map((row) => ({
      timestamp: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }));
  }

  async getQuote(symbol: string): Promise<Quote> {
    const url = new URL("/api/v3/ticker/24hr", this.baseUrl);
    url.searchParams.set("symbol", symbol.toUpperCase());

    const response = await fetch(url);
    if (!response.ok) {
      throw new AppError(APP_ERROR_CODE.MARKET_DATA_UNAVAILABLE, `Binance вернул ${response.status} для ${symbol}`);
    }

    const raw = (await response.json()) as { lastPrice: string; priceChangePercent: string };
    return {
      price: Number(raw.lastPrice),
      changePercent: Number(raw.priceChangePercent),
      asOf: new Date().toISOString(),
    };
  }
}

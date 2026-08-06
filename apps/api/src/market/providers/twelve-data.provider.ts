import { ConfigService } from "@nestjs/config";
import type { AssetClass, OhlcvCandle } from "@chartmate/shared";

import { AppError, APP_ERROR_CODE } from "../../common/errors/app-error";
import type { NormalizedTimeframe } from "../timeframe";
import type { MarketDataProvider, Quote } from "./market-data-provider.interface";

const TWELVE_DATA_INTERVAL: Record<NormalizedTimeframe, string> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "30m": "30min",
  "1h": "1h",
  "4h": "4h",
  "1d": "1day",
  "1w": "1week",
};

const CANDLE_LIMIT = 200;

interface TwelveDataTimeSeriesResponse {
  status: "ok" | "error";
  message?: string;
  values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }>;
}

interface TwelveDataQuoteResponse {
  status?: "error";
  message?: string;
  close: string;
  percent_change: string;
  datetime: string;
}

/**
 * Twelve Data покрывает акции и форекс одним API — единственное отличие между
 * классами активов в этом провайдере в том, как выглядит символ ("AAPL" vs "EUR/USD"),
 * поэтому это абстрактный класс, а не два независимых провайдера.
 */
export abstract class TwelveDataProviderBase implements MarketDataProvider {
  abstract readonly assetClass: AssetClass;

  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string {
    return this.config.getOrThrow<string>("TWELVE_DATA_API_KEY");
  }

  async getOhlcv(symbol: string, timeframe: NormalizedTimeframe): Promise<OhlcvCandle[]> {
    const url = new URL("https://api.twelvedata.com/time_series");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", TWELVE_DATA_INTERVAL[timeframe]);
    url.searchParams.set("outputsize", String(CANDLE_LIMIT));
    url.searchParams.set("apikey", this.apiKey);

    const response = await fetch(url);
    const body = (await response.json()) as TwelveDataTimeSeriesResponse;
    if (!response.ok || body.status === "error" || !body.values) {
      throw new AppError(
        APP_ERROR_CODE.MARKET_DATA_UNAVAILABLE,
        `Twelve Data вернул ошибку для ${symbol}: ${body.message ?? response.status}`,
      );
    }

    return body.values
      .map((row) => ({
        timestamp: new Date(row.datetime).getTime(),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume ?? 0),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async getQuote(symbol: string): Promise<Quote> {
    const url = new URL("https://api.twelvedata.com/quote");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("apikey", this.apiKey);

    const response = await fetch(url);
    const body = (await response.json()) as TwelveDataQuoteResponse;
    if (!response.ok || body.status === "error") {
      throw new AppError(
        APP_ERROR_CODE.MARKET_DATA_UNAVAILABLE,
        `Twelve Data вернул ошибку для ${symbol}: ${body.message ?? response.status}`,
      );
    }

    return {
      price: Number(body.close),
      changePercent: Number(body.percent_change),
      asOf: body.datetime,
    };
  }
}

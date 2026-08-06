import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { OhlcvCandle } from "@chartmate/shared";

import { AppError, APP_ERROR_CODE } from "../../common/errors/app-error";
import type { NormalizedTimeframe } from "../timeframe";
import type { MarketDataProvider, Quote } from "./market-data-provider.interface";

const CANDLE_LIMIT = 200;

interface FredObservationsResponse {
  observations?: Array<{ date: string; value: string }>;
  error_message?: string;
}

/**
 * FRED публикует доходности гособлигаций США раз в торговый день —
 * внутридневных таймфреймов для этого класса активов не существует,
 * поэтому timeframe игнорируется и всегда отдаются дневные точки.
 */
@Injectable()
export class BondProvider implements MarketDataProvider {
  readonly assetClass = "BOND" as const;

  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string {
    return this.config.getOrThrow<string>("FRED_API_KEY");
  }

  async getOhlcv(symbol: string, _timeframe: NormalizedTimeframe): Promise<OhlcvCandle[]> {
    const observations = await this.fetchObservations(symbol, CANDLE_LIMIT);
    return observations
      .map((row) => {
        const value = Number(row.value);
        return {
          timestamp: new Date(row.date).getTime(),
          open: value,
          high: value,
          low: value,
          close: value,
          volume: 0,
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async getQuote(symbol: string): Promise<Quote> {
    const observations = await this.fetchObservations(symbol, 2);
    const latest = observations.at(-1);
    const previous = observations.at(-2);
    if (!latest) {
      throw new AppError(APP_ERROR_CODE.MARKET_DATA_UNAVAILABLE, `FRED не вернул данных для ${symbol}`);
    }

    const latestValue = Number(latest.value);
    const previousValue = previous ? Number(previous.value) : null;
    const changePercent = previousValue && previousValue !== 0 ? ((latestValue - previousValue) / previousValue) * 100 : null;

    return { price: latestValue, changePercent, asOf: latest.date };
  }

  private async fetchObservations(symbol: string, limit: number): Promise<Array<{ date: string; value: string }>> {
    const url = new URL("https://api.stlouisfed.org/fred/series/observations");
    url.searchParams.set("series_id", symbol.toUpperCase());
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("sort_order", "desc");
    url.searchParams.set("limit", String(limit));

    const response = await fetch(url);
    const body = (await response.json()) as FredObservationsResponse;
    if (!response.ok || !body.observations) {
      throw new AppError(
        APP_ERROR_CODE.MARKET_DATA_UNAVAILABLE,
        `FRED вернул ошибку для ${symbol}: ${body.error_message ?? response.status}`,
      );
    }

    return body.observations.filter((row) => row.value !== ".").reverse();
  }
}

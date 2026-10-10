import { z } from "zod";

import { AssetClassSchema } from "./instrument.schema.js";

export const OhlcvCandleSchema = z
  .object({
    timestamp: z.number().int().nonnegative(),
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    volume: z.number().nonnegative(),
  })
  .strict();

export const MarketDataSchema = z
  .object({
    ticker: z.string(),
    timeframe: z.string(),
    assetClass: AssetClassSchema,
    candles: z.array(OhlcvCandleSchema),
  })
  .strict();

export type OhlcvCandle = z.infer<typeof OhlcvCandleSchema>;
export type MarketData = z.infer<typeof MarketDataSchema>;

/**
 * Котировка в потоке реального времени. Крипта приходит из WebSocket Binance
 * (апдейт раз в секунду), остальные классы — опросом провайдера с шагом,
 * который допускает его тариф; поэтому источник и частота указаны явно.
 */
export const LiveQuoteSchema = z
  .object({
    symbol: z.string(),
    assetClass: AssetClassSchema,
    price: z.number(),
    changePercent: z.number().nullable(),
    asOf: z.string(),
    source: z.enum(["BINANCE_WS", "PROVIDER_POLL"]),
  })
  .strict();

export type LiveQuote = z.infer<typeof LiveQuoteSchema>;

/**
 * Строка обзорной таблицы рынка — те же колонки, что показывает CoinMarketCap.
 * Источник — публичный CoinGecko: он отдаёт капитализацию и предложение,
 * которых нет у биржевого API.
 */
export const CoinOverviewSchema = z
  .object({
    id: z.string(),
    rank: z.number().int().nullable(),
    symbol: z.string(),
    name: z.string(),
    image: z.string(),
    /** Тикер той же монеты на Binance, если он есть в нашем каталоге. */
    tradingSymbol: z.string().nullable(),
    price: z.number(),
    change1h: z.number().nullable(),
    change24h: z.number().nullable(),
    change7d: z.number().nullable(),
    marketCap: z.number().nullable(),
    volume24h: z.number().nullable(),
    circulatingSupply: z.number().nullable(),
    sparkline7d: z.array(z.number()),
  })
  .strict();

export type CoinOverview = z.infer<typeof CoinOverviewSchema>;

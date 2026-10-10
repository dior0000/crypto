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

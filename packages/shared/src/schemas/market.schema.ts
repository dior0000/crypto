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

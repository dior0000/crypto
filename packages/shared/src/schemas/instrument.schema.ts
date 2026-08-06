import { z } from "zod";

import { ASSET_CLASS } from "../constants/index.js";

export const AssetClassSchema = z.enum([
  ASSET_CLASS.EQUITY,
  ASSET_CLASS.FOREX,
  ASSET_CLASS.CRYPTO,
  ASSET_CLASS.BOND,
]);

export const InstrumentSchema = z
  .object({
    symbol: z.string(),
    name: z.string(),
    assetClass: AssetClassSchema,
    exchange: z.string().nullable(),
  })
  .strict();

export const QuoteSchema = z
  .object({
    symbol: z.string(),
    assetClass: AssetClassSchema,
    price: z.number(),
    changePercent: z.number().nullable(),
    asOf: z.string(),
  })
  .strict();

export type AssetClass = z.infer<typeof AssetClassSchema>;
export type Instrument = z.infer<typeof InstrumentSchema>;
export type Quote = z.infer<typeof QuoteSchema>;

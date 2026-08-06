import { z } from "zod";

import { CHART_TYPE } from "../constants/index.js";

export const ChartTypeSchema = z.enum([
  CHART_TYPE.CANDLES,
  CHART_TYPE.BARS,
  CHART_TYPE.LINE,
  CHART_TYPE.HEIKIN_ASHI,
  CHART_TYPE.UNKNOWN,
]);

export const DrawnLevelSchema = z
  .object({
    price: z.number(),
    label: z.string().optional(),
  })
  .strict();

export const VisionResultSchema = z
  .object({
    ticker: z.string().nullable(),
    timeframe: z.string().nullable(),
    drawnLevels: z.array(DrawnLevelSchema),
    indicators: z.array(z.string()),
    chartType: ChartTypeSchema,
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type VisionResult = z.infer<typeof VisionResultSchema>;
export type DrawnLevel = z.infer<typeof DrawnLevelSchema>;

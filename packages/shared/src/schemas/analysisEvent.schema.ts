import { z } from "zod";

import { ObservationSchema } from "./observation.schema.js";

export const ANALYSIS_UPDATE_STATUS = {
  COMPLETED: "COMPLETED",
  LOW_CONFIDENCE: "LOW_CONFIDENCE",
  MISSING_CONTEXT: "MISSING_CONTEXT",
  BLOCKED: "BLOCKED",
  ERROR: "ERROR",
} as const;

export const AnalysisUpdateStatusSchema = z.enum([
  ANALYSIS_UPDATE_STATUS.COMPLETED,
  ANALYSIS_UPDATE_STATUS.LOW_CONFIDENCE,
  ANALYSIS_UPDATE_STATUS.MISSING_CONTEXT,
  ANALYSIS_UPDATE_STATUS.BLOCKED,
  ANALYSIS_UPDATE_STATUS.ERROR,
]);

/** Полезная нагрузка SSE-события `GET /api/sessions/:id/analyses/stream`. */
export const AnalysisUpdateEventSchema = z
  .object({
    sessionId: z.string(),
    frameId: z.string(),
    status: AnalysisUpdateStatusSchema,
    observation: ObservationSchema.nullable(),
  })
  .strict();

export type AnalysisUpdateStatus = z.infer<typeof AnalysisUpdateStatusSchema>;
export type AnalysisUpdateEvent = z.infer<typeof AnalysisUpdateEventSchema>;

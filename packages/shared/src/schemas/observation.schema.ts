import { z } from "zod";

import { BEHAVIOR_FLAG_KIND } from "../constants/index.js";

export const BehaviorFlagKindSchema = z.enum([
  BEHAVIOR_FLAG_KIND.OVERTRADING,
  BEHAVIOR_FLAG_KIND.REVENGE,
  BEHAVIOR_FLAG_KIND.NO_STOP,
  BEHAVIOR_FLAG_KIND.COUNTER_TREND,
  BEHAVIOR_FLAG_KIND.SIZE_CREEP,
]);

export const BehaviorFlagSchema = z
  .object({
    kind: BehaviorFlagKindSchema,
    note: z.string(),
  })
  .strict();

/**
 * Форма ответа модели пользователю. Намеренно не содержит полей вроде
 * "direction", "targetPrice" или "probability" — LLM не может их
 * заполнить, даже если схему обойдёт промпт-инъекцией, а лишние ключи
 * отклоняются `.strict()`. Финальная защита — GuardrailValidator, который
 * дополнительно сканирует все строковые поля на стоп-словарь.
 */
export const ObservationSchema = z
  .object({
    summary: z.string().min(1),
    questions: z.array(z.string()).default([]),
    behaviorFlags: z.array(BehaviorFlagSchema).default([]),
    statsNote: z.string().optional(),
  })
  .strict();

export type BehaviorFlag = z.infer<typeof BehaviorFlagSchema>;
export type Observation = z.infer<typeof ObservationSchema>;

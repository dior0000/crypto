import { z } from "zod";

export const TradeSideSchema = z.enum(["LONG", "SHORT"]);

export const TradeOutcomeSchema = z.enum(["WIN", "LOSS", "BREAKEVEN"]);

/**
 * Это запись пользователя о его собственной сделке — не рекомендация
 * системы. Поля entry/stop/target/side фиксируют то, что пользователь
 * уже решил и сделал, поэтому GuardrailValidator к JournalEntry не
 * применяется.
 */
export const JournalEntrySchema = z
  .object({
    ticker: z.string().min(1),
    side: TradeSideSchema.optional(),
    entry: z.number().optional(),
    stop: z.number().optional(),
    target: z.number().optional(),
    rr: z.number().optional(),
    notes: z.string().optional(),
    plannedBeforeEntry: z.boolean(),
    outcome: TradeOutcomeSchema.optional(),
    closedAt: z.string().datetime().optional(),
  })
  .strict();

export type TradeSide = z.infer<typeof TradeSideSchema>;
export type TradeOutcome = z.infer<typeof TradeOutcomeSchema>;
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

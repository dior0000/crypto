import { z } from "zod";

export const NewsArticleSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    url: z.string(),
    title: z.string(),
    summary: z.string().nullable(),
    publishedAt: z.string(),
    tickers: z.array(z.string()),
  })
  .strict();

/**
 * Подмножество полей новости, которое реально попадает в промпт LLM —
 * только факт публикации, без summary (чтобы не тащить в контекст лишний
 * текст, который модель может начать интерпретировать как повод для прогноза).
 */
export const NewsContextItemSchema = z
  .object({
    source: z.string(),
    title: z.string(),
    publishedAt: z.string(),
  })
  .strict();

export type NewsArticle = z.infer<typeof NewsArticleSchema>;
export type NewsContextItem = z.infer<typeof NewsContextItemSchema>;

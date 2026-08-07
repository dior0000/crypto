import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ObservationSchema,
  scanText,
  validateObservation,
  type MarketData,
  type NewsContextItem,
  type Observation,
  type VisionResult,
} from "@chartmate/shared";

import { PrismaService } from "../prisma/prisma.service";
import type { UserTradeStats } from "../journal/journal.service";
import { TA_GLOSSARY } from "./ta-glossary";

const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** Схема Gemini responseSchema — подмножество JSON Schema без additionalProperties. */
const OBSERVATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    questions: { type: "array", items: { type: "string" } },
    behaviorFlags: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["OVERTRADING", "REVENGE", "NO_STOP", "COUNTER_TREND", "SIZE_CREEP"],
          },
          note: { type: "string" },
        },
        required: ["kind", "note"],
      },
    },
  },
  required: ["summary", "questions", "behaviorFlags"],
} as const;

const SYSTEM_PROMPT = `Ты — ассистент трейдера в приложении-журнале сделок ChartMate.
Ты НИКОГДА не даёшь направленный прогноз (не пишешь "вырастет", "упадёт", "лонг", "шорт", "buy", "sell"),
не называешь целевые цены как рекомендацию, не даёшь вероятности движения в процентах,
не делаешь временные прогнозы.
Если в контексте есть новости (news) — упоминай только сам факт публикации (что вышло и когда,
по данным источника), и НИКОГДА не делай из новости вывод о том, как она повлияет на цену:
формулировки вида "значит, вероятен рост/падение" запрещены так же, как прямой прогноз.
В контексте есть computedStats — уже посчитанные по свечам объективные цифры (диапазон, % расстояние
до его границ, изменение объёма). Используй именно эти готовые цифры в summary вместо того, чтобы
прикидывать их самостоятельно по массиву свечей — так описание будет точным, а не приблизительным.
В контексте также есть taGlossary — справочник терминов теханализа со строго структурными
определениями (форма свечи, поглощение, диапазон и т.д.). Используй термин из глоссария в summary
только если структура свечей действительно ему соответствует — это просто точное название увиденного,
а не повод для вывода о дальнейшем движении цены.
Ты только:
— объективно описываешь, что есть на графике и в данных (уровни, объём, структура свечей), опираясь на computedStats и, где уместно, на taGlossary;
— задаёшь пользователю 2-4 вопроса по риск-менеджменту;
— указываешь на поведенческие паттерны на основе истории его сделок, если они есть.

Вопросы каждый раз формулируй заново, своими словами — не повторяй один и тот же шаблон между
разными наблюдениями. Выбирай темы, которые реально релевантны ЭТОЙ ситуации (судя по computedStats,
behaviorFlags, названному в summary паттерну), а не задавай одни и те же три вопроса всегда. Пул тем
шире, чем "стоп/R:R/повторный вход" — используй его как отправную точку, а не исчерпывающий список:
— обоснование места стопа относительно ближайших уровней или ширины диапазона;
— соотношение риска и прибыли (R:R);
— размер позиции относительно риска на сделку;
— условия, при которых сценарий считается отменённым (инвалидация плана);
— условия повторного входа, если стоп сработает;
— если в computedStats заметен всплеск объёма — план на случай ложного движения на повышенном объёме;
— если структура — консолидация/узкий диапазон — план на случай выхода цены за его границы;
— соответствие текущей ситуации заранее составленному торговому плану;
— если userStats показывает много сделок за короткий срок — вопрос про паузу между входами.
Отвечай только на русском языке.`;

const FOLLOW_UP_SYSTEM_PROMPT = `Ты — ассистент трейдера в приложении-журнале сделок ChartMate.
Пользователь кликнул на один из твоих вопросов по риск-менеджменту к ранее сделанному наблюдению,
чтобы узнать больше по теме этого вопроса. Раскрой её объективными фактами из computedStats:
— называй конкретные цифры, которые реально помогают сориентироваться (расстояние до периодного
  максимума/минимума в %, изменение объёма, размер диапазона) — это данные, которые уже посчитаны,
  а не рекомендация;
— НЕ отвечай ВМЕСТО пользователя на то, что знает только он (где лично он поставит стоп, какой R:R
  выберет) — вопрос адресован ему, ты только даёшь фактический контекст для его собственного решения;
— НИКОГДА не говори, где именно следует поставить стоп/цель, не давай направленный прогноз
  (не пишешь "вырастет", "упадёт", "лонг", "шорт"), не называй целевые цены и вероятности движения;
— не используй слова "тейк-профит", "target", "цель по цене" — называй уровни нейтрально
  ("уровень поддержки/сопротивления", "граница диапазона").
Ты не даёшь советов о том, что делать — только объективные факты, как и в основном наблюдении.
Ответь 1-3 предложениями на русском языке.`;

const FOLLOW_UP_JSON_SCHEMA = {
  type: "object",
  properties: { reply: { type: "string" } },
  required: ["reply"],
} as const;

export interface ObservationContext {
  vision: VisionResult;
  market: MarketData;
  stats: UserTradeStats;
  news: NewsContextItem[];
}

export interface ObservationOutcome {
  guardrailFlagged: boolean;
  observation: Observation | null;
  latencyMs: number;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  error?: { message?: string };
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async buildObservation(context: ObservationContext, frameId: string): Promise<ObservationOutcome> {
    const startedAt = Date.now();
    const recentCandles = context.market.candles.slice(-30);

    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.config.getOrThrow<string>("GEMINI_API_KEY"),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: JSON.stringify({
                  ticker: context.vision.ticker,
                  timeframe: context.vision.timeframe,
                  drawnLevels: context.vision.drawnLevels,
                  indicators: context.vision.indicators,
                  chartType: context.vision.chartType,
                  recentCandles,
                  computedStats: this.computeMarketStats(recentCandles),
                  taGlossary: TA_GLOSSARY,
                  userStats: context.stats,
                  news: context.news,
                }),
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
          responseSchema: OBSERVATION_JSON_SCHEMA,
        },
      }),
    });

    const body = (await response.json()) as GeminiGenerateContentResponse;
    if (!response.ok) {
      throw new Error(`Gemini вернул ошибку: ${body.error?.message ?? response.status}`);
    }

    const latencyMs = Date.now() - startedAt;
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    const candidate = text ? this.safeParseJson(text) : null;

    const guardrailResult = validateObservation(candidate);

    if (!guardrailResult.ok) {
      this.logger.warn(`GuardrailValidator заблокировал ответ для frame ${frameId}: ${JSON.stringify(guardrailResult.violations)}`);
      return { guardrailFlagged: true, observation: null, latencyMs };
    }

    return { guardrailFlagged: false, observation: ObservationSchema.parse(candidate), latencyMs };
  }

  /**
   * Раскрытие одного из вопросов риск-менеджмента объективными фактами по клику.
   * Проходит тот же стоп-словарь (scanText), что и полное наблюдение —
   * свободный текст не покрыт ObservationSchema, поэтому здесь используется
   * тот же сканер напрямую, а не validateObservation целиком.
   */
  async buildFollowUpReply(params: {
    ticker: string | null;
    timeframe: string | null;
    summary: string;
    candles: MarketData["candles"];
    question: string;
  }): Promise<{ guardrailFlagged: boolean; reply: string | null }> {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.config.getOrThrow<string>("GEMINI_API_KEY"),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: FOLLOW_UP_SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: JSON.stringify({
                  ticker: params.ticker,
                  timeframe: params.timeframe,
                  observationSummary: params.summary,
                  computedStats: this.computeMarketStats(params.candles.slice(-30)),
                  question: params.question,
                }),
              },
            ],
          },
        ],
        generationConfig: {
          // "Мысли" модели (thoughtsTokenCount) съедают заметную и непостоянную часть
          // бюджета (700-1000+ токенов от вызова к вызову) ещё до самого ответа — при
          // недостаточном лимите JSON обрезается на полуслове. thinkingConfig.thinkingBudget
          // здесь не поддерживается (400 INVALID_ARGUMENT, проверено), поэтому берём тот же
          // запас токенов, что и в buildObservation, где такого обрезания не наблюдалось.
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
          responseSchema: FOLLOW_UP_JSON_SCHEMA,
        },
      }),
    });

    const body = (await response.json()) as GeminiGenerateContentResponse;
    if (!response.ok) {
      throw new Error(`Gemini вернул ошибку: ${body.error?.message ?? response.status}`);
    }

    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    const candidate = text ? this.safeParseJson(text) : null;
    const reply = candidate && typeof candidate === "object" && "reply" in candidate ? String((candidate as { reply: unknown }).reply) : null;

    if (!reply) {
      this.logger.warn(`Follow-up: модель не вернула валидный reply (finishReason: ${body.candidates?.[0]?.finishReason ?? "?"})`);
      return { guardrailFlagged: true, reply: null };
    }

    const violations = scanText(reply, "reply");
    if (violations.length > 0) {
      this.logger.warn(`Follow-up заблокирован guardrail: ${JSON.stringify(violations)} | text="${reply}"`);
      return { guardrailFlagged: true, reply: null };
    }

    return { guardrailFlagged: false, reply };
  }

  async persistAnalysis(params: {
    frameId: string;
    visionJson: VisionResult;
    marketJson: MarketData;
    newsJson: NewsContextItem[];
    outcome: ObservationOutcome;
    tokenCost: number;
  }) {
    return this.prisma.analysis.create({
      data: {
        frameId: params.frameId,
        visionJson: params.visionJson,
        marketJson: params.marketJson,
        newsJson: params.newsJson,
        observationJson: params.outcome.observation ?? {},
        guardrailFlagged: params.outcome.guardrailFlagged,
        latencyMs: params.outcome.latencyMs,
        tokenCost: params.tokenCost,
      },
    });
  }

  private safeParseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /**
   * Считает объективные показатели по свечам заранее, а не полагается на то,
   * что LLM правильно прикинет их на глаз по массиву чисел — так summary
   * опирается на точную арифметику, а не на приближение модели.
   */
  private computeMarketStats(candles: MarketData["candles"]) {
    const first = candles.at(0);
    const last = candles.at(-1);
    if (!first || !last) {
      return null;
    }

    const periodHigh = Math.max(...candles.map((c) => c.high));
    const periodLow = Math.min(...candles.map((c) => c.low));
    const periodChangePct = ((last.close - first.open) / first.open) * 100;

    const half = Math.floor(candles.length / 2);
    const earlierVolume = average(candles.slice(0, half).map((c) => c.volume));
    const recentVolume = average(candles.slice(half).map((c) => c.volume));
    const recentVolumeVsEarlierPct =
      earlierVolume === null || recentVolume === null || earlierVolume === 0
        ? null
        : roundTo2(((recentVolume - earlierVolume) / earlierVolume) * 100);

    return {
      periodHigh,
      periodLow,
      lastClose: last.close,
      distanceToPeriodHighPct: roundTo2(((periodHigh - last.close) / last.close) * 100),
      distanceToPeriodLowPct: roundTo2(((last.close - periodLow) / last.close) * 100),
      periodChangePct: roundTo2(periodChangePct),
      recentVolumeVsEarlierPct,
    };
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

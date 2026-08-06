import Anthropic from "@anthropic-ai/sdk";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ObservationSchema,
  validateObservation,
  type MarketData,
  type NewsContextItem,
  type Observation,
  type VisionResult,
} from "@chartmate/shared";

import { PrismaService } from "../prisma/prisma.service";
import type { UserTradeStats } from "../journal/journal.service";

const ANALYSIS_MODEL = "claude-opus-5";

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
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "questions", "behaviorFlags"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `Ты — ассистент трейдера в приложении-журнале сделок ChartMate.
Ты НИКОГДА не даёшь направленный прогноз (не пишешь "вырастет", "упадёт", "лонг", "шорт", "buy", "sell"),
не называешь целевые цены как рекомендацию, не даёшь вероятности движения в процентах,
не делаешь временные прогнозы.
Если в контексте есть новости (news) — упоминай только сам факт публикации (что вышло и когда,
по данным источника), и НИКОГДА не делай из новости вывод о том, как она повлияет на цену:
формулировки вида "значит, вероятен рост/падение" запрещены так же, как прямой прогноз.
Ты только:
— объективно описываешь, что есть на графике и в данных (уровни, объём, структура свечей);
— задаёшь пользователю вопросы по риск-менеджменту (стоп, R:R, повторный вход);
— указываешь на поведенческие паттерны на основе истории его сделок, если они есть.
Отвечай только на русском языке.`;

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

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private readonly client: Anthropic;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.client = new Anthropic({ apiKey: this.config.getOrThrow<string>("ANTHROPIC_API_KEY") });
  }

  async buildObservation(context: ObservationContext, frameId: string): Promise<ObservationOutcome> {
    const startedAt = Date.now();

    const response = await this.client.messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: OBSERVATION_JSON_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            ticker: context.vision.ticker,
            timeframe: context.vision.timeframe,
            drawnLevels: context.vision.drawnLevels,
            indicators: context.vision.indicators,
            chartType: context.vision.chartType,
            recentCandles: context.market.candles.slice(-30),
            userStats: context.stats,
            news: context.news,
          }),
        },
      ],
    });

    const latencyMs = Date.now() - startedAt;
    const textBlock = response.content.find((block) => block.type === "text");
    const candidate = textBlock && textBlock.type === "text" ? this.safeParseJson(textBlock.text) : null;

    const guardrailResult = validateObservation(candidate);

    if (!guardrailResult.ok) {
      this.logger.warn(`GuardrailValidator заблокировал ответ для frame ${frameId}: ${JSON.stringify(guardrailResult.violations)}`);
      return { guardrailFlagged: true, observation: null, latencyMs };
    }

    return { guardrailFlagged: false, observation: ObservationSchema.parse(candidate), latencyMs };
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
}

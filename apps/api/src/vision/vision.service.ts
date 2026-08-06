import Anthropic from "@anthropic-ai/sdk";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { VISION_CONFIDENCE_THRESHOLD, VisionResultSchema, type VisionResult } from "@chartmate/shared";

const VISION_MODEL = "claude-opus-5";

const VISION_JSON_SCHEMA = {
  type: "object",
  properties: {
    ticker: { type: ["string", "null"] },
    timeframe: { type: ["string", "null"] },
    drawnLevels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          price: { type: "number" },
          label: { type: "string" },
        },
        required: ["price"],
        additionalProperties: false,
      },
    },
    indicators: { type: "array", items: { type: "string" } },
    chartType: { type: "string", enum: ["CANDLES", "BARS", "LINE", "HEIKIN_ASHI", "UNKNOWN"] },
    confidence: { type: "number" },
  },
  required: ["ticker", "timeframe", "drawnLevels", "indicators", "chartType", "confidence"],
  additionalProperties: false,
} as const;

export interface AnalyzeFrameInput {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png";
}

export type VisionAnalysisResult =
  | { ok: true; result: VisionResult }
  | { ok: false; reason: "LOW_CONFIDENCE" | "INVALID_RESPONSE" };

@Injectable()
export class VisionService {
  private readonly client: Anthropic;

  constructor(private readonly config: ConfigService) {
    this.client = new Anthropic({ apiKey: this.config.getOrThrow<string>("ANTHROPIC_API_KEY") });
  }

  async analyzeFrame(input: AnalyzeFrameInput): Promise<VisionAnalysisResult> {
    const response = await this.client.messages.create({
      model: VISION_MODEL,
      max_tokens: 1024,
      thinking: { type: "disabled" },
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: VISION_JSON_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: input.mediaType, data: input.imageBase64 } },
            {
              type: "text",
              text: "Определи по скриншоту графика: тикер, таймфрейм, нарисованные пользователем уровни (цена и подпись), включённые индикаторы и тип графика. Не считывай значения OHLCV с пикселей — только видимую разметку интерфейса. Верни confidence от 0 до 1 — насколько уверенно распознан контекст.",
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { ok: false, reason: "INVALID_RESPONSE" };
    }

    let candidate: unknown;
    try {
      candidate = JSON.parse(textBlock.text);
    } catch {
      return { ok: false, reason: "INVALID_RESPONSE" };
    }

    const parsed = VisionResultSchema.safeParse(candidate);
    if (!parsed.success) {
      return { ok: false, reason: "INVALID_RESPONSE" };
    }

    if (parsed.data.confidence < VISION_CONFIDENCE_THRESHOLD) {
      return { ok: false, reason: "LOW_CONFIDENCE" };
    }

    return { ok: true, result: parsed.data };
  }
}

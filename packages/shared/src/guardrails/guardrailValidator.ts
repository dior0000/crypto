import { ObservationSchema } from "../schemas/observation.schema.js";
import { GUARDRAIL_PATTERNS, type GuardrailCategory } from "./stopWords.js";

export type GuardrailViolationCategory = GuardrailCategory | "SCHEMA_VIOLATION";

export interface GuardrailViolation {
  category: GuardrailViolationCategory;
  field: string;
  matchedText: string;
}

export interface GuardrailResult {
  ok: boolean;
  violations: GuardrailViolation[];
}

/**
 * Сканирует произвольную строку на стоп-словарь железного правила
 * (см. packages/shared/src/guardrails/stopWords.ts и CLAUDE.md).
 */
export function scanText(text: string, field = "text"): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  for (const { category, pattern } of GUARDRAIL_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      violations.push({ category, field, matchedText: match[0] });
    }
  }
  return violations;
}

function collectStringFields(value: unknown, path: string): Array<{ field: string; text: string }> {
  if (typeof value === "string") {
    return [{ field: path, text: value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectStringFields(item, `${path}[${index}]`));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, val]) => collectStringFields(val, path ? `${path}.${key}` : key));
  }
  return [];
}

/**
 * Единственная точка, через которую обязан пройти любой LLM-ответ перед
 * отдачей клиенту (GuardrailValidator из CLAUDE.md). Сначала строгий
 * zod-парсинг схемы ObservationSchema (лишние/директивные поля вроде
 * "direction" отклоняются `.strict()`), затем построчное сканирование
 * всех строковых полей на стоп-словарь.
 *
 * Если результат ok === false — ответ НЕ показывается пользователю,
 * инцидент логируется вызывающей стороной (Analysis.guardrailFlagged).
 */
export function validateObservation(candidate: unknown): GuardrailResult {
  const parsed = ObservationSchema.safeParse(candidate);

  if (!parsed.success) {
    return {
      ok: false,
      violations: parsed.error.issues.map((issue) => ({
        category: "SCHEMA_VIOLATION",
        field: issue.path.join(".") || "root",
        matchedText: issue.message,
      })),
    };
  }

  const violations = collectStringFields(parsed.data, "").flatMap(({ field, text }) => scanText(text, field || "root"));

  return { ok: violations.length === 0, violations };
}

export type GuardrailCategory =
  | "DIRECTIONAL_FORECAST"
  | "TARGET_PRICE_RECOMMENDATION"
  | "MOVE_PROBABILITY"
  | "TIME_FORECAST";

interface GuardrailPattern {
  category: GuardrailCategory;
  pattern: RegExp;
}

/**
 * JS `\b` определяет границу слова только по ASCII `\w` — на кириллице она
 * никогда не срабатывает (Cyrillic-буквы не входят в `\w`, даже с флагом `u`).
 * Поэтому для кириллических паттернов границу слова эмулируем через
 * `\p{L}`-lookaround вместо `\b`. Для латиницы (buy/sell/long/short) обычный
 * `\b` работает корректно.
 */
function ru(pattern: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`, "iu");
}

/**
 * Стоп-словарь железного правила продукта (см. CLAUDE.md). Каждый паттерн
 * ловит формулировку, а не тему: слово "тренд" само по себе не запрещено,
 * запрещён направленный призыв/прогноз ("тренд говорит — покупай").
 */
export const GUARDRAIL_PATTERNS: GuardrailPattern[] = [
  // Направленный прогноз / рекомендация действия
  { category: "DIRECTIONAL_FORECAST", pattern: ru("лонг(?:ов|а|у|е|и)?") },
  { category: "DIRECTIONAL_FORECAST", pattern: ru("шорт(?:ов|а|у|е|и)?") },
  { category: "DIRECTIONAL_FORECAST", pattern: ru("(?:открывай|входи|заходи)\\s+.{0,15}?(?:лонг|шорт)") },
  { category: "DIRECTIONAL_FORECAST", pattern: ru("покупа(?:й|йте|ть)") },
  { category: "DIRECTIONAL_FORECAST", pattern: ru("продава(?:й|йте|ть)") },
  { category: "DIRECTIONAL_FORECAST", pattern: /\b(?:buy|sell)\b/iu },
  { category: "DIRECTIONAL_FORECAST", pattern: /\blong\b/iu },
  { category: "DIRECTIONAL_FORECAST", pattern: /\bshort\b/iu },
  { category: "DIRECTIONAL_FORECAST", pattern: /цена\s+(?:точно\s+)?пойд[её]т\s+(?:вверх|вниз)/iu },
  { category: "DIRECTIONAL_FORECAST", pattern: ru("вырастет|выраст[еи]т|поднимется|упад[её]т|обвалится|рухнет") },
  { category: "DIRECTIONAL_FORECAST", pattern: /\b(?:bullish|bearish)\b/iu },
  { category: "DIRECTIONAL_FORECAST", pattern: /к\s+лун[еы]|to\s+the\s+moon/iu },

  // Целевая цена как рекомендация
  { category: "TARGET_PRICE_RECOMMENDATION", pattern: ru("реком(?:ендую|ендация|ендуем)") },
  { category: "TARGET_PRICE_RECOMMENDATION", pattern: ru("мо[йя]\\s+прогноз") },
  { category: "TARGET_PRICE_RECOMMENDATION", pattern: ru("прогнозиру(?:ю|ем|ет)") },
  { category: "TARGET_PRICE_RECOMMENDATION", pattern: ru("цель\\s+по\\s+цене") },
  { category: "TARGET_PRICE_RECOMMENDATION", pattern: ru("тейк[\\s-]?профит") },
  { category: "TARGET_PRICE_RECOMMENDATION", pattern: /\btake[\s-]?profit\b/iu },
  { category: "TARGET_PRICE_RECOMMENDATION", pattern: /\bprice\s+target\b/iu },

  // Вероятности движения в процентах
  { category: "MOVE_PROBABILITY", pattern: ru("вероятность\\s+(?:роста|падения|движения)") },
  { category: "MOVE_PROBABILITY", pattern: ru("\\d{1,3}\\s?%\\s*(?:вероятности|шанс(?:ов)?)") },
  { category: "MOVE_PROBABILITY", pattern: /\bchance\s+of\s+(?:going\s+)?(?:up|down)\b/iu },
  { category: "MOVE_PROBABILITY", pattern: /\bprobability\s+of\s+(?:a\s+)?(?:rise|drop|fall|increase|decrease)\b/iu },

  // Временные прогнозы
  {
    category: "TIME_FORECAST",
    pattern: ru("в\\s+течение\\s+(?:часа|дня|недели|минут)\\s+.{0,30}?(?:вырастет|упад[её]т|поднимется)"),
  },
  { category: "TIME_FORECAST", pattern: ru("к\\s+концу\\s+(?:дня|недели|сессии)\\s+.{0,30}?(?:вырастет|упад[её]т)") },
  { category: "TIME_FORECAST", pattern: ru("скоро\\s+.{0,20}?(?:вырастет|упад[её]т|разворот)") },
  { category: "TIME_FORECAST", pattern: /\bwithin\s+(?:the\s+)?(?:hour|day|week)\b.{0,20}\b(?:will|going\s+to)\b/iu },
];

export const FREE_PLAN_MONTHLY_ANALYSES = 20;

export const VISION_CONFIDENCE_THRESHOLD = 0.6;

export const PHASH_DIFF_THRESHOLD = 0.08;

export const AUTO_ANALYSIS_DEBOUNCE_MS = 15_000;

export const VISION_RESULT_CACHE_TTL_MS = 60_000;

export const FRAME_MAX_DIMENSION_PX = 1024;

export const FRAME_JPEG_QUALITY = 0.7;

export const PLAN = {
  FREE: "FREE",
  PRO: "PRO",
} as const;

export const BEHAVIOR_FLAG_KIND = {
  OVERTRADING: "OVERTRADING",
  REVENGE: "REVENGE",
  NO_STOP: "NO_STOP",
  COUNTER_TREND: "COUNTER_TREND",
  SIZE_CREEP: "SIZE_CREEP",
} as const;

export const CHART_TYPE = {
  CANDLES: "CANDLES",
  BARS: "BARS",
  LINE: "LINE",
  HEIKIN_ASHI: "HEIKIN_ASHI",
  UNKNOWN: "UNKNOWN",
} as const;

export const ASSET_CLASS = {
  EQUITY: "EQUITY",
  FOREX: "FOREX",
  CRYPTO: "CRYPTO",
  BOND: "BOND",
} as const;

export const NEWS_LOOKBACK_HOURS = 48;

export const NEWS_MAX_ARTICLES_PER_ANALYSIS = 3;

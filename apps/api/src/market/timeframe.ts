import { AppError, APP_ERROR_CODE } from "../common/errors/app-error";

/**
 * Vision-модель считывает таймфрейм с подписи на графике (например "1H", "4h", "D"),
 * поэтому перед обращением к любому провайдеру данных его нужно свести к одному
 * из нормализованных значений — иначе провайдеры разъедутся в трактовке одной и той же строки.
 */
export type NormalizedTimeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";

const ALIASES: Record<string, NormalizedTimeframe> = {
  "1m": "1m",
  "1min": "1m",
  "5m": "5m",
  "5min": "5m",
  "15m": "15m",
  "15min": "15m",
  "30m": "30m",
  "30min": "30m",
  "1h": "1h",
  "60m": "1h",
  h: "1h",
  "4h": "4h",
  "240m": "4h",
  "1d": "1d",
  "1day": "1d",
  d: "1d",
  "1w": "1w",
  "1week": "1w",
  w: "1w",
};

export function normalizeTimeframe(raw: string): NormalizedTimeframe {
  const key = raw.trim().toLowerCase();
  const normalized = ALIASES[key];
  if (!normalized) {
    throw new AppError(APP_ERROR_CODE.MARKET_DATA_UNAVAILABLE, `Неизвестный таймфрейм: ${raw}`);
  }
  return normalized;
}

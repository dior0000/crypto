import type { CoinOverview, JournalEntry, JournalEntryUpdate, LiveQuote } from "@chartmate/shared";

import { getToken } from "./auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export class UnauthorizedError extends Error {}

async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  if (!token) {
    throw new UnauthorizedError("Нет токена авторизации");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${token}` },
  });

  if (response.status === 401) {
    throw new UnauthorizedError("Сессия истекла, войдите заново");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? `Не удалось выполнить запрос: ${response.status}`);
  }
  return response;
}

export async function fetchJournalEntries(): Promise<(JournalEntry & { id: string; createdAt: string })[]> {
  const response = await authorizedFetch("/api/journal");
  return response.json();
}

export async function createJournalEntry(entry: JournalEntry): Promise<void> {
  await authorizedFetch("/api/journal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(entry),
  });
}

export async function updateJournalEntry(id: string, update: JournalEntryUpdate): Promise<void> {
  await authorizedFetch(`/api/journal/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update),
  });
}

export async function deleteJournalEntry(id: string): Promise<void> {
  await authorizedFetch(`/api/journal/${id}`, { method: "DELETE" });
}

export interface InstrumentRecord {
  id: string;
  symbol: string;
  name: string;
  assetClass: "EQUITY" | "FOREX" | "CRYPTO" | "BOND";
  exchange: string | null;
}

export interface QuoteRecord {
  symbol: string;
  assetClass: InstrumentRecord["assetClass"];
  price: number;
  changePercent: number | null;
  asOf: string;
}

export interface NewsArticleRecord {
  id: string;
  source: string;
  url: string;
  title: string;
  summary: string | null;
  publishedAt: string;
  tickers: string[];
}

export async function searchInstruments(query: string): Promise<InstrumentRecord[]> {
  const response = await authorizedFetch(`/api/market/instruments?q=${encodeURIComponent(query)}`);
  return response.json();
}

export async function fetchQuote(symbol: string): Promise<QuoteRecord> {
  const response = await authorizedFetch(`/api/market/quote?symbol=${encodeURIComponent(symbol)}`);
  return response.json();
}

export async function fetchNewsForTicker(symbol: string): Promise<NewsArticleRecord[]> {
  const response = await authorizedFetch(`/api/news?ticker=${encodeURIComponent(symbol)}`);
  return response.json();
}

export async function fetchLatestNews(): Promise<NewsArticleRecord[]> {
  const response = await authorizedFetch("/api/news/latest");
  return response.json();
}

export interface ObservationRecord {
  id: string;
  createdAt: string;
  visionJson: { ticker: string | null; timeframe: string | null };
  observationJson: {
    summary: string;
    questions: string[];
    behaviorFlags: { kind: "OVERTRADING" | "REVENGE" | "NO_STOP" | "COUNTER_TREND" | "SIZE_CREEP"; note: string }[];
    statsNote?: string;
  };
  newsJson: { source: string; title: string; publishedAt: string }[];
}

export async function fetchObservations(): Promise<ObservationRecord[]> {
  const response = await authorizedFetch("/api/observations");
  return response.json();
}

export interface AnalyzeResult {
  id: string;
  createdAt: string;
  guardrailFlagged: boolean;
  visionJson: { ticker: string | null; timeframe: string | null };
  observationJson: Partial<ObservationRecord["observationJson"]>;
}

export async function analyzeInstrument(symbol: string, timeframe: string): Promise<AnalyzeResult> {
  const response = await authorizedFetch("/api/observations/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ symbol, timeframe }),
  });
  return response.json();
}

export const TIMEFRAME_OPTIONS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"] as const;

export interface FollowUpReply {
  guardrailFlagged: boolean;
  reply: string | null;
}

export async function askFollowUp(observationId: string, question: string): Promise<FollowUpReply> {
  const response = await authorizedFetch(`/api/observations/${observationId}/follow-up`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
  });
  return response.json();
}

/**
 * Подписка на поток котировок. EventSource здесь не подходит — он не умеет
 * слать заголовок авторизации, поэтому читаем SSE из обычного fetch.
 * Промис завершается, когда поток закрыт или подписка отменена через signal.
 */
export type StreamState = "connecting" | "live" | "retrying";

/** Пауза перед переподключением: 1, 2, 4… но не дольше 15 секунд. */
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 15_000;

export async function streamQuotes(
  symbols: string[],
  onQuotes: (quotes: LiveQuote[]) => void,
  signal: AbortSignal,
  onState?: (state: StreamState) => void,
): Promise<void> {
  const query = encodeURIComponent(symbols.join(","));
  let attempt = 0;

  // Поток рвётся по любой причине — перезапуск сервера, засыпание вкладки,
  // таймаут прокси. Без переподключения цены молча застывают навсегда.
  while (!signal.aborted) {
    try {
      onState?.(attempt === 0 ? "connecting" : "retrying");
      const response = await authorizedFetch(`/api/market/stream?symbols=${query}`, { signal });
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Поток не открылся");

      onState?.("live");
      attempt = 0;

      const decoder = new TextDecoder();
      let buffer = "";

      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            onQuotes(JSON.parse(line.slice(5)) as LiveQuote[]);
          } catch {
            // битый кадр пропускаем — следующий тик придёт через секунду
          }
        }
      }
    } catch (err) {
      if (signal.aborted || err instanceof UnauthorizedError) throw err;
    }

    if (signal.aborted) return;
    onState?.("retrying");
    const pause = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
    attempt += 1;
    await new Promise((resolve) => setTimeout(resolve, pause));
  }
}


export interface BehaviorFlagRecord {
  id: string;
  kind: "OVERTRADING" | "REVENGE" | "NO_STOP" | "COUNTER_TREND" | "SIZE_CREEP";
  detectedAt: string;
  payload: Record<string, unknown> | null;
}

export async function fetchBehaviorFlags(): Promise<BehaviorFlagRecord[]> {
  const response = await authorizedFetch("/api/journal/behavior-flags");
  return response.json();
}

export interface OhlcvResponse {
  ticker: string;
  timeframe: string;
  assetClass: InstrumentRecord["assetClass"];
  candles: { timestamp: number; open: number; high: number; low: number; close: number; volume: number }[];
}

export async function fetchOhlcv(symbol: string, timeframe: string): Promise<OhlcvResponse> {
  const response = await authorizedFetch(
    `/api/market/ohlcv?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
  );
  return response.json();
}

export async function fetchMarketOverview(limit = 25): Promise<CoinOverview[]> {
  const response = await authorizedFetch(`/api/market/overview?limit=${limit}`);
  return response.json();
}

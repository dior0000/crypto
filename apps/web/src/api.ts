import type { JournalEntry } from "@chartmate/shared";

import { getToken } from "./auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export class UnauthorizedError extends Error {}

export interface BehaviorFlagRecord {
  id: string;
  kind: "OVERTRADING" | "REVENGE" | "NO_STOP" | "COUNTER_TREND" | "SIZE_CREEP";
  detectedAt: string;
  payload: Record<string, unknown>;
}

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

export async function fetchBehaviorFlags(): Promise<BehaviorFlagRecord[]> {
  const response = await authorizedFetch("/api/journal/behavior-flags");
  return response.json();
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

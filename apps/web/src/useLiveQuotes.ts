import { useEffect, useState } from "react";
import type { LiveQuote } from "@chartmate/shared";

import { streamQuotes } from "./api";

/** Направление последнего изменения — только для подсветки, живёт меньше секунды. */
export interface LiveQuoteState extends LiveQuote {
  dir: "up" | "down" | null;
}

const FLASH_MS = 700;

/** Один общий пустой результат: без подписки хук не должен трогать состояние. */
const NO_QUOTES: Map<string, LiveQuoteState> = new Map();

/**
 * Держит открытой одну подписку на переданные символы и отдаёт последние цены.
 * Пересоздаётся только когда меняется сам набор символов, а не их порядок.
 */
export function useLiveQuotes(symbols: string[]): Map<string, LiveQuoteState> {
  const [quotes, setQuotes] = useState<Map<string, LiveQuoteState>>(new Map());
  const key = [...new Set(symbols)].sort().join(",");

  useEffect(() => {
    if (!key) return;

    const controller = new AbortController();
    const flashTimers = new Map<string, number>();

    const clearFlash = (symbol: string) => {
      setQuotes((prev) => {
        const current = prev.get(symbol);
        if (!current || current.dir === null) return prev;
        const next = new Map(prev);
        next.set(symbol, { ...current, dir: null });
        return next;
      });
    };

    void streamQuotes(
      key.split(","),
      (batch) => {
        setQuotes((prev) => {
          const next = new Map(prev);
          for (const quote of batch) {
            const previous = prev.get(quote.symbol);
            const dir = !previous
              ? null
              : quote.price > previous.price
                ? "up"
                : quote.price < previous.price
                  ? "down"
                  : previous.dir;
            next.set(quote.symbol, { ...quote, dir });
          }
          return next;
        });

        for (const quote of batch) {
          const running = flashTimers.get(quote.symbol);
          if (running) window.clearTimeout(running);
          flashTimers.set(quote.symbol, window.setTimeout(() => clearFlash(quote.symbol), FLASH_MS));
        }
      },
      controller.signal,
    ).catch(() => {
      // обрыв потока не должен ронять панель: последние цены остаются на экране
    });

    return () => {
      controller.abort();
      for (const timer of flashTimers.values()) window.clearTimeout(timer);
    };
  }, [key]);

  return key ? quotes : NO_QUOTES;
}

/** Цена с нужным числом знаков: у BTC и у SOL разная «цена деления». */
export function formatPrice(price: number): string {
  const digits = price >= 1000 ? 2 : price >= 1 ? 3 : 6;
  return price.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

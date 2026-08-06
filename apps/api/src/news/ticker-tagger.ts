export interface TaggableInstrument {
  symbol: string;
  name: string;
}

/**
 * Находит инструменты, упомянутые в тексте новости — по тикеру или по первому
 * слову названия компании (например "Apple" для AAPL). Это эвристика для
 * группировки новостей по инструментам в UI, не источник финансовых выводов.
 */
export function tagTickers(text: string, instruments: TaggableInstrument[]): string[] {
  const matched = new Set<string>();

  for (const instrument of instruments) {
    const symbolPattern = new RegExp(`\\b${escapeRegExp(instrument.symbol)}\\b`, "i");
    if (symbolPattern.test(text)) {
      matched.add(instrument.symbol);
      continue;
    }

    const firstWord = instrument.name.split(/[\s.,]+/)[0];
    if (firstWord && firstWord.length > 3) {
      const namePattern = new RegExp(`\\b${escapeRegExp(firstWord)}\\b`, "i");
      if (namePattern.test(text)) {
        matched.add(instrument.symbol);
      }
    }
  }

  return [...matched];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

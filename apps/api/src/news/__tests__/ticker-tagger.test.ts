import { describe, expect, it } from "vitest";

import { tagTickers } from "../ticker-tagger";

const instruments = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "NVDA", name: "NVIDIA Corp." },
  { symbol: "EUR/USD", name: "Евро / Доллар США" },
];

describe("tagTickers", () => {
  it("матчит по тикеру", () => {
    expect(tagTickers("NVDA surges after earnings beat", instruments)).toEqual(["NVDA"]);
  });

  it("матчит по первому слову названия компании", () => {
    expect(tagTickers("Apple unveils new chip lineup", instruments)).toEqual(["AAPL"]);
  });

  it("матчит символ с непробуквенными символами (форекс-пара)", () => {
    expect(tagTickers("EUR/USD rebounds on ECB commentary", instruments)).toEqual(["EUR/USD"]);
  });

  it("не матчит частичные вхождения без границы слова", () => {
    expect(tagTickers("NVDAX is unrelated ticker noise", instruments)).toEqual([]);
  });

  it("возвращает пусто, если совпадений нет", () => {
    expect(tagTickers("Unrelated market commentary", instruments)).toEqual([]);
  });
});

import type { AssetClass } from "@chartmate/shared";

export interface SeedInstrument {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  exchange: string | null;
}

/**
 * Стартовый набор инструментов для поиска в Markets-панели. Не претендует на
 * полноту — это отправная точка, реальный охват растёт по мере того, как
 * пользователи ищут тикеры, которых здесь ещё нет (см. InstrumentsService.search).
 */
export const SEED_INSTRUMENTS: SeedInstrument[] = [
  // Акции NASDAQ
  { symbol: "AAPL", name: "Apple Inc.", assetClass: "EQUITY", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corp.", assetClass: "EQUITY", exchange: "NASDAQ" },
  { symbol: "NVDA", name: "NVIDIA Corp.", assetClass: "EQUITY", exchange: "NASDAQ" },
  { symbol: "GOOGL", name: "Alphabet Inc. Class A", assetClass: "EQUITY", exchange: "NASDAQ" },
  { symbol: "AMZN", name: "Amazon.com Inc.", assetClass: "EQUITY", exchange: "NASDAQ" },
  { symbol: "META", name: "Meta Platforms Inc.", assetClass: "EQUITY", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla Inc.", assetClass: "EQUITY", exchange: "NASDAQ" },
  { symbol: "AVGO", name: "Broadcom Inc.", assetClass: "EQUITY", exchange: "NASDAQ" },
  { symbol: "NFLX", name: "Netflix Inc.", assetClass: "EQUITY", exchange: "NASDAQ" },
  { symbol: "AMD", name: "Advanced Micro Devices Inc.", assetClass: "EQUITY", exchange: "NASDAQ" },
  // Форекс — мажорные пары
  { symbol: "EUR/USD", name: "Евро / Доллар США", assetClass: "FOREX", exchange: null },
  { symbol: "GBP/USD", name: "Фунт стерлингов / Доллар США", assetClass: "FOREX", exchange: null },
  { symbol: "USD/JPY", name: "Доллар США / Японская иена", assetClass: "FOREX", exchange: null },
  { symbol: "USD/CHF", name: "Доллар США / Швейцарский франк", assetClass: "FOREX", exchange: null },
  { symbol: "AUD/USD", name: "Австралийский доллар / Доллар США", assetClass: "FOREX", exchange: null },
  { symbol: "USD/CAD", name: "Доллар США / Канадский доллар", assetClass: "FOREX", exchange: null },
  // Облигации — доходности гособлигаций США (FRED); symbol = series_id
  { symbol: "DGS3MO", name: "Казначейские векселя США, 3 мес.", assetClass: "BOND", exchange: "FRED" },
  { symbol: "DGS2", name: "Гособлигации США, 2 года", assetClass: "BOND", exchange: "FRED" },
  { symbol: "DGS10", name: "Гособлигации США, 10 лет", assetClass: "BOND", exchange: "FRED" },
  { symbol: "DGS30", name: "Гособлигации США, 30 лет", assetClass: "BOND", exchange: "FRED" },
  // Крипто (Binance)
  { symbol: "BTCUSDT", name: "Bitcoin / Tether", assetClass: "CRYPTO", exchange: "Binance" },
  { symbol: "ETHUSDT", name: "Ethereum / Tether", assetClass: "CRYPTO", exchange: "Binance" },
  { symbol: "SOLUSDT", name: "Solana / Tether", assetClass: "CRYPTO", exchange: "Binance" },
  { symbol: "BNBUSDT", name: "BNB / Tether", assetClass: "CRYPTO", exchange: "Binance" },
];

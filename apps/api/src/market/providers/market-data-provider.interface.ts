import type { AssetClass, OhlcvCandle } from "@chartmate/shared";

import type { NormalizedTimeframe } from "../timeframe";

export interface Quote {
  price: number;
  changePercent: number | null;
  asOf: string;
}

export interface MarketDataProvider {
  readonly assetClass: AssetClass;
  getOhlcv(symbol: string, timeframe: NormalizedTimeframe): Promise<OhlcvCandle[]>;
  getQuote(symbol: string): Promise<Quote>;
}

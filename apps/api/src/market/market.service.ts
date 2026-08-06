import { Injectable } from "@nestjs/common";
import { MarketDataSchema, type AssetClass, type MarketData } from "@chartmate/shared";

import { InstrumentsService } from "./instruments.service";
import { normalizeTimeframe } from "./timeframe";
import { BinanceProvider } from "./providers/binance.provider";
import { EquityProvider } from "./providers/equity.provider";
import { ForexProvider } from "./providers/forex.provider";
import { BondProvider } from "./providers/bond.provider";
import type { MarketDataProvider, Quote } from "./providers/market-data-provider.interface";

@Injectable()
export class MarketDataService {
  private readonly providers: Record<AssetClass, MarketDataProvider>;

  constructor(
    private readonly instruments: InstrumentsService,
    binance: BinanceProvider,
    equity: EquityProvider,
    forex: ForexProvider,
    bond: BondProvider,
  ) {
    this.providers = { CRYPTO: binance, EQUITY: equity, FOREX: forex, BOND: bond };
  }

  /** Тикер приходит из vision-распознавания скриншота — класс актива у него не определён заранее. */
  async getOhlcv(rawSymbol: string, rawTimeframe: string): Promise<MarketData> {
    const instrument = await this.instruments.requireBySymbol(rawSymbol);
    const timeframe = normalizeTimeframe(rawTimeframe);
    const provider = this.providers[instrument.assetClass];

    const candles = await provider.getOhlcv(instrument.symbol, timeframe);
    return MarketDataSchema.parse({
      ticker: instrument.symbol,
      timeframe,
      assetClass: instrument.assetClass,
      candles,
    });
  }

  async getQuote(symbol: string): Promise<Quote & { symbol: string; assetClass: AssetClass }> {
    const instrument = await this.instruments.requireBySymbol(symbol);
    const provider = this.providers[instrument.assetClass];
    const quote = await provider.getQuote(instrument.symbol);
    return { ...quote, symbol: instrument.symbol, assetClass: instrument.assetClass };
  }
}

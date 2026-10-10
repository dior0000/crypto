import { Module } from "@nestjs/common";

import { CoinOverviewService } from "./coin-overview.service";
import { InstrumentsService } from "./instruments.service";
import { LiveQuotesService } from "./live-quotes.service";
import { MarketController } from "./market.controller";
import { MarketDataService } from "./market.service";
import { BinanceProvider } from "./providers/binance.provider";
import { EquityProvider } from "./providers/equity.provider";
import { ForexProvider } from "./providers/forex.provider";
import { BondProvider } from "./providers/bond.provider";

@Module({
  controllers: [MarketController],
  providers: [InstrumentsService, MarketDataService, LiveQuotesService, CoinOverviewService, BinanceProvider, EquityProvider, ForexProvider, BondProvider],
  exports: [MarketDataService, InstrumentsService],
})
export class MarketModule {}

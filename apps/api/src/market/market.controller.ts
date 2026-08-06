import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { InstrumentsService } from "./instruments.service";
import { MarketDataService } from "./market.service";

@Controller("api/market")
@UseGuards(JwtAuthGuard)
export class MarketController {
  constructor(
    private readonly instruments: InstrumentsService,
    private readonly marketData: MarketDataService,
  ) {}

  @Get("instruments")
  async searchInstruments(@Query("q") query = "") {
    if (!query.trim()) return this.instruments.listAll();
    return this.instruments.search(query);
  }

  @Get("quote")
  async getQuote(@Query("symbol") symbol: string) {
    return this.marketData.getQuote(symbol);
  }

  @Get("ohlcv")
  async getOhlcv(@Query("symbol") symbol: string, @Query("timeframe") timeframe: string) {
    return this.marketData.getOhlcv(symbol, timeframe);
  }
}

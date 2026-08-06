import { Module } from "@nestjs/common";

import { MarketModule } from "../market/market.module";
import { NewsController } from "./news.controller";
import { NewsService } from "./news.service";

@Module({
  imports: [MarketModule],
  controllers: [NewsController],
  providers: [NewsService],
  exports: [NewsService],
})
export class NewsModule {}

import { Module } from "@nestjs/common";

import { VisionModule } from "../vision/vision.module";
import { MarketModule } from "../market/market.module";
import { NewsModule } from "../news/news.module";
import { JournalModule } from "../journal/journal.module";
import { BillingModule } from "../billing/billing.module";
import { QueueModule } from "../queue/queue.module";
import { AnalysisService } from "./analysis.service";
import { AnalysisProcessor } from "./analysis.processor";
import { AnalysisController } from "./analysis.controller";
import { ObservationsController } from "./observations.controller";

@Module({
  imports: [VisionModule, MarketModule, NewsModule, JournalModule, BillingModule, QueueModule],
  controllers: [AnalysisController, ObservationsController],
  providers: [AnalysisService, AnalysisProcessor],
  exports: [AnalysisService],
})
export class AnalysisModule {}

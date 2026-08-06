import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { Job } from "bullmq";

import { QUEUE_NAMES } from "../queue/queue.constants";
import { VisionService } from "../vision/vision.service";
import { MarketDataService } from "../market/market.service";
import { NewsService } from "../news/news.service";
import { JournalService } from "../journal/journal.service";
import { BillingService } from "../billing/billing.service";
import { AnalysisService } from "./analysis.service";
import { ANALYSIS_UPDATE_EVENT, type AnalysisUpdateEvent } from "./analysis.events";

export interface VisionJobData {
  frameId: string;
  sessionId: string;
  userId: string;
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png";
}

@Processor(QUEUE_NAMES.VISION)
export class AnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(
    private readonly visionService: VisionService,
    private readonly marketDataService: MarketDataService,
    private readonly newsService: NewsService,
    private readonly journalService: JournalService,
    private readonly billingService: BillingService,
    private readonly analysisService: AnalysisService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<VisionJobData>): Promise<void> {
    const { frameId, sessionId, userId, imageBase64, mediaType } = job.data;

    try {
      await this.billingService.assertCanRunAnalysis(userId);

      const vision = await this.visionService.analyzeFrame({ imageBase64, mediaType });

      if (!vision.ok) {
        this.logger.log(`Frame ${frameId}: vision недостаточно уверен (${vision.reason})`);
        this.emitUpdate({ sessionId, frameId, status: "LOW_CONFIDENCE", observation: null });
        return;
      }

      if (!vision.result.ticker || !vision.result.timeframe) {
        this.logger.log(`Frame ${frameId}: не удалось определить тикер или таймфрейм`);
        this.emitUpdate({ sessionId, frameId, status: "MISSING_CONTEXT", observation: null });
        return;
      }

      const [market, stats, news] = await Promise.all([
        this.marketDataService.getOhlcv(vision.result.ticker, vision.result.timeframe),
        this.journalService.getUserStats(userId),
        this.newsService.getContextForTicker(vision.result.ticker),
      ]);

      const outcome = await this.analysisService.buildObservation({ vision: vision.result, market, stats, news }, frameId);

      await this.analysisService.persistAnalysis({
        frameId,
        visionJson: vision.result,
        marketJson: market,
        newsJson: news,
        outcome,
        tokenCost: 0,
      });

      await this.billingService.recordAnalysisUsed(userId);

      this.emitUpdate({
        sessionId,
        frameId,
        status: outcome.guardrailFlagged ? "BLOCKED" : "COMPLETED",
        observation: outcome.guardrailFlagged ? null : outcome.observation,
      });
    } catch (err) {
      // Клиент ждёт событие в SSE-стриме на каждый отправленный кадр — без
      // этого emit сбой (упавший Vision/Market API, лимит тарифа) навсегда
      // подвешивает индикатор анализа в side panel без обратной связи.
      this.logger.error(`Frame ${frameId}: ошибка обработки — ${err instanceof Error ? err.message : String(err)}`);
      this.emitUpdate({ sessionId, frameId, status: "ERROR", observation: null });
      throw err;
    }
  }

  private emitUpdate(event: AnalysisUpdateEvent): void {
    this.eventEmitter.emit(ANALYSIS_UPDATE_EVENT, event);
  }
}

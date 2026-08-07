import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import type { MarketData, VisionResult } from "@chartmate/shared";
import { z } from "zod";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUserId } from "../common/decorators/current-user.decorator";
import { AppError, APP_ERROR_CODE } from "../common/errors/app-error";
import { PrismaService } from "../prisma/prisma.service";
import { InstrumentsService } from "../market/instruments.service";
import { MarketDataService } from "../market/market.service";
import { NewsService } from "../news/news.service";
import { JournalService } from "../journal/journal.service";
import { BillingService } from "../billing/billing.service";
import { AnalysisService } from "./analysis.service";

const RECENT_LIMIT = 20;

const AnalyzeRequestSchema = z.object({
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
});

const FollowUpRequestSchema = z.object({
  question: z.string().min(1),
});

/**
 * Список прошлых наблюдений для дашборда. Отдаём только то, что прошло
 * GuardrailValidator (guardrailFlagged: false) — заблокированные ответы не
 * содержат готового observationJson и пользователю не показывались изначально.
 */
@Controller("api/observations")
@UseGuards(JwtAuthGuard)
export class ObservationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instruments: InstrumentsService,
    private readonly marketData: MarketDataService,
    private readonly newsService: NewsService,
    private readonly journalService: JournalService,
    private readonly billingService: BillingService,
    private readonly analysisService: AnalysisService,
  ) {}

  @Get()
  async listForUser(@CurrentUserId() userId: string) {
    return this.prisma.analysis.findMany({
      where: { guardrailFlagged: false, frame: { session: { userId } } },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        visionJson: true,
        observationJson: true,
        newsJson: true,
        createdAt: true,
      },
    });
  }

  /**
   * Наблюдение по выбранному инструменту без скриншота — на вход только
   * тикер+таймфрейм, данные берутся из реального OHLCV и новостей. Ответ
   * модели проходит тот же GuardrailValidator, что и в потоке расширения.
   */
  @Post("analyze")
  async analyze(@CurrentUserId() userId: string, @Body() body: unknown) {
    const { symbol, timeframe } = AnalyzeRequestSchema.parse(body);

    await this.billingService.assertCanRunAnalysis(userId);

    const instrument = await this.instruments.requireBySymbol(symbol);
    const [market, stats, news] = await Promise.all([
      this.marketData.getOhlcv(instrument.symbol, timeframe),
      this.journalService.getUserStats(userId),
      this.newsService.getContextForTicker(instrument.symbol),
    ]);

    const vision: VisionResult = {
      ticker: instrument.symbol,
      timeframe: market.timeframe,
      drawnLevels: [],
      indicators: [],
      chartType: "UNKNOWN",
      confidence: 1,
    };

    const session = await this.prisma.session.create({
      data: { userId, ticker: instrument.symbol, timeframe: market.timeframe, endedAt: new Date() },
    });
    const frame = await this.prisma.frame.create({
      data: { sessionId: session.id, phash: `manual:${Date.now()}` },
    });

    let outcome;
    try {
      outcome = await this.analysisService.buildObservation({ vision, market, stats, news }, frame.id);
    } catch (err) {
      throw new AppError(
        APP_ERROR_CODE.ANALYSIS_UNAVAILABLE,
        `Модель анализа недоступна: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const analysis = await this.analysisService.persistAnalysis({
      frameId: frame.id,
      visionJson: vision,
      marketJson: market,
      newsJson: news,
      outcome,
      tokenCost: 0,
    });

    await this.billingService.recordAnalysisUsed(userId);

    return analysis;
  }

  /**
   * Раскрытие одного из вопросов риск-менеджмента по клику: модель сама
   * приводит релевантные объективные цифры по этому вопросу (например,
   * ближайшие уровни и дистанцию до них), не отвечая ЗА пользователя на то,
   * что знает только он (где лично он поставит стоп). Контекст берётся из
   * уже сохранённой записи наблюдения — не требует нового OHLCV.
   */
  @Post(":id/follow-up")
  async followUp(@CurrentUserId() userId: string, @Param("id") id: string, @Body() body: unknown) {
    const { question } = FollowUpRequestSchema.parse(body);

    const analysis = await this.prisma.analysis.findUnique({
      where: { id },
      include: { frame: { include: { session: true } } },
    });

    if (!analysis || analysis.frame.session.userId !== userId) {
      throw new NotFoundException("Наблюдение не найдено");
    }

    const vision = analysis.visionJson as unknown as VisionResult;
    const market = analysis.marketJson as unknown as MarketData;
    const observation = analysis.observationJson as unknown as { summary?: string };

    try {
      return await this.analysisService.buildFollowUpReply({
        ticker: vision.ticker,
        timeframe: vision.timeframe,
        summary: observation.summary ?? "",
        candles: market.candles,
        question,
      });
    } catch (err) {
      throw new AppError(
        APP_ERROR_CODE.ANALYSIS_UNAVAILABLE,
        `Модель анализа недоступна: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import Parser from "rss-parser";
import { NEWS_LOOKBACK_HOURS, NEWS_MAX_ARTICLES_PER_ANALYSIS, type NewsContextItem } from "@chartmate/shared";

import { PrismaService } from "../prisma/prisma.service";
import { InstrumentsService } from "../market/instruments.service";
import { DEFAULT_NEWS_RSS_FEEDS } from "./rss-feeds";
import { tagTickers } from "./ticker-tagger";

const FEED_ITEM_LIMIT_PER_POLL = 30;

/* Опрос раз в минуту означает ~1400 запросов в сутки на фид. Публичные RSS
   на это отвечают 429, поэтому упавший фид временно выбывает: пауза удваивается
   с каждой неудачей подряд, но не длиннее получаса. */
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 30 * 60_000;

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private readonly parser = new Parser({ timeout: 15_000 });
  /** Состояние фидов: когда можно снова опрашивать и сколько неудач подряд. */
  private readonly feedState = new Map<string, { nextAt: number; failures: number }>();
  private lastIngestAt: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly instruments: InstrumentsService,
  ) {}

  private get feedUrls(): string[] {
    const configured = this.config.get<string>("NEWS_RSS_FEEDS");
    if (!configured) return DEFAULT_NEWS_RSS_FEEDS;
    return configured
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async pollFeeds(): Promise<void> {
    const instruments = await this.instruments.listAll();
    const now = Date.now();

    for (const feedUrl of this.feedUrls) {
      const state = this.feedState.get(feedUrl);
      if (state && state.nextAt > now) continue; // фид под паузой после ошибки

      try {
        await this.pollSingleFeed(feedUrl, instruments);
        this.feedState.set(feedUrl, { nextAt: 0, failures: 0 });
      } catch (err) {
        // Один упавший RSS-фид (недоступен, 429, невалидный XML) не должен блокировать остальные.
        const failures = (state?.failures ?? 0) + 1;
        const pause = Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
        this.feedState.set(feedUrl, { nextAt: now + pause, failures });
        this.logger.warn(
          `Фид ${feedUrl} не ответил (${failures}-я неудача подряд), пауза ${Math.round(pause / 60000)} мин: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    this.lastIngestAt = new Date().toISOString();
  }

  /** Время последнего успешного обхода — клиент показывает его рядом с лентой. */
  getLastIngestAt(): string | null {
    return this.lastIngestAt;
  }

  private async pollSingleFeed(feedUrl: string, instruments: Awaited<ReturnType<InstrumentsService["listAll"]>>): Promise<void> {
    const feed = await this.parser.parseURL(feedUrl);
    const source = feed.title ?? new URL(feedUrl).hostname;

    for (const item of (feed.items ?? []).slice(0, FEED_ITEM_LIMIT_PER_POLL)) {
      if (!item.link || !item.title) continue;

      const publishedAt = item.isoDate ?? item.pubDate;
      if (!publishedAt) continue;

      const summary = item.contentSnippet ?? null;
      const tickers = tagTickers(`${item.title} ${summary ?? ""}`, instruments);

      await this.prisma.newsArticle.upsert({
        where: { url: item.link },
        update: {},
        create: {
          source,
          url: item.link,
          title: item.title,
          summary,
          tickers,
          publishedAt: new Date(publishedAt),
        },
      });
    }
  }

  async listForTicker(ticker: string, limit = 20) {
    return this.prisma.newsArticle.findMany({
      where: { tickers: { has: ticker.toUpperCase() } },
      orderBy: { publishedAt: "desc" },
      take: limit,
    });
  }

  /** Общая лента — не привязана к тикеру, чтобы новости были видны сразу, до выбора инструмента. */
  async listRecent(limit = 30) {
    return this.prisma.newsArticle.findMany({
      orderBy: { publishedAt: "desc" },
      take: limit,
    });
  }

  /** Контекст для LLM: только факт публикации, без summary — см. NewsContextItemSchema. */
  async getContextForTicker(ticker: string): Promise<NewsContextItem[]> {
    const since = new Date(Date.now() - NEWS_LOOKBACK_HOURS * 60 * 60 * 1000);
    const articles = await this.prisma.newsArticle.findMany({
      where: { tickers: { has: ticker.toUpperCase() }, publishedAt: { gte: since } },
      orderBy: { publishedAt: "desc" },
      take: NEWS_MAX_ARTICLES_PER_ANALYSIS,
    });

    return articles.map((article) => ({
      source: article.source,
      title: article.title,
      publishedAt: article.publishedAt.toISOString(),
    }));
  }
}

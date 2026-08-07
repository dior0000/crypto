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

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private readonly parser = new Parser();

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

  @Cron(CronExpression.EVERY_10_MINUTES)
  async pollFeeds(): Promise<void> {
    const instruments = await this.instruments.listAll();

    for (const feedUrl of this.feedUrls) {
      try {
        await this.pollSingleFeed(feedUrl, instruments);
      } catch (err) {
        // Один упавший RSS-фид (недоступен, невалидный XML) не должен блокировать остальные.
        this.logger.warn(`Не удалось разобрать фид ${feedUrl}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
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

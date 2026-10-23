import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { NewsService } from "./news.service";

@Controller("api/news")
@UseGuards(JwtAuthGuard)
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  async list(@Query("ticker") ticker: string) {
    return this.newsService.listForTicker(ticker);
  }

  @Get("latest")
  async listLatest() {
    return this.newsService.listRecent();
  }

  /** Когда лента последний раз обходила фиды — видно, что сбор действительно идёт раз в минуту. */
  @Get("status")
  async status() {
    return { lastIngestAt: this.newsService.getLastIngestAt(), intervalSec: 60 };
  }
}

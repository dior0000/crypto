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
}

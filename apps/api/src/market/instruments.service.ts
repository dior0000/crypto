import { Injectable, Logger, OnModuleInit } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { AppError, APP_ERROR_CODE } from "../common/errors/app-error";
import { SEED_INSTRUMENTS } from "./instruments.seed";

const SEARCH_LIMIT = 20;

@Injectable()
export class InstrumentsService implements OnModuleInit {
  private readonly logger = new Logger(InstrumentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    for (const instrument of SEED_INSTRUMENTS) {
      await this.prisma.instrument.upsert({
        where: { symbol: instrument.symbol },
        update: { name: instrument.name, assetClass: instrument.assetClass, exchange: instrument.exchange },
        create: instrument,
      });
    }
    this.logger.log(`Инструменты синхронизированы: ${SEED_INSTRUMENTS.length}`);
  }

  async search(query: string) {
    const normalized = query.trim();
    if (!normalized) return [];

    return this.prisma.instrument.findMany({
      where: {
        OR: [
          { symbol: { contains: normalized, mode: "insensitive" } },
          { name: { contains: normalized, mode: "insensitive" } },
        ],
      },
      take: SEARCH_LIMIT,
      orderBy: { symbol: "asc" },
    });
  }

  /**
   * Vision-модель считывает тикер с подписи на графике буквально ("EURUSD" без
   * слэша для форекс-пар, произвольный регистр) — эта эвристика подгоняет его
   * под канонический формат символа, под которым инструмент реально сохранён.
   */
  async requireBySymbol(rawSymbol: string) {
    const upper = rawSymbol.trim().toUpperCase();

    const direct = await this.prisma.instrument.findUnique({ where: { symbol: upper } });
    if (direct) return direct;

    if (/^[A-Z]{6}$/.test(upper)) {
      const withSlash = `${upper.slice(0, 3)}/${upper.slice(3)}`;
      const forexMatch = await this.prisma.instrument.findUnique({ where: { symbol: withSlash } });
      if (forexMatch) return forexMatch;
    }

    throw new AppError(APP_ERROR_CODE.MARKET_DATA_UNAVAILABLE, `Инструмент ${rawSymbol} не найден`);
  }

  async listAll() {
    return this.prisma.instrument.findMany({ orderBy: { symbol: "asc" } });
  }
}

import { Injectable } from "@nestjs/common";
import { JournalEntrySchema, type JournalEntry } from "@chartmate/shared";
import type { BehaviorFlagKind } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { BehaviorFlagsService } from "./behavior-flags.service";

const RECENT_FLAGS_WINDOW_MS = 48 * 60 * 60 * 1000;

export interface UserTradeStats {
  totalTrades: number;
  tradesLast24h: number;
  plannedShare: number;
  recentFlags: BehaviorFlagKind[];
}

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly behaviorFlagsService: BehaviorFlagsService,
  ) {}

  async createEntry(userId: string, input: JournalEntry) {
    const entry = JournalEntrySchema.parse(input);
    const created = await this.prisma.journalEntry.create({
      data: { userId, ...entry },
    });

    await this.behaviorFlagsService.evaluateForUser(userId);

    return created;
  }

  async listEntries(userId: string) {
    return this.prisma.journalEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async getUserStats(userId: string): Promise<UserTradeStats> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalTrades, tradesLast24h, plannedTrades, recentFlags] = await Promise.all([
      this.prisma.journalEntry.count({ where: { userId } }),
      this.prisma.journalEntry.count({ where: { userId, createdAt: { gte: since24h } } }),
      this.prisma.journalEntry.count({ where: { userId, plannedBeforeEntry: true } }),
      this.behaviorFlagsService.getRecentKinds(userId, RECENT_FLAGS_WINDOW_MS),
    ]);

    return {
      totalTrades,
      tradesLast24h,
      plannedShare: totalTrades === 0 ? 1 : plannedTrades / totalTrades,
      recentFlags,
    };
  }
}

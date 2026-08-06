import { Injectable } from "@nestjs/common";
import { BEHAVIOR_FLAG_KIND } from "@chartmate/shared";
import type { BehaviorFlagKind, Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";

const OVERTRADING_WINDOW_MS = 24 * 60 * 60 * 1000;
const OVERTRADING_THRESHOLD = 3;
const REVENGE_WINDOW_MS = 30 * 60 * 1000;
const DEDUPE_WINDOW_MS = 60 * 60 * 1000;

export interface DetectedFlag {
  kind: BehaviorFlagKind;
  payload: Prisma.InputJsonObject;
}

/**
 * Правило-based детекторы поведенческого риска поверх собственной истории
 * сделок пользователя (см. CLAUDE.md: «флаги поведенческого риска на основе
 * истории пользователя»). Намеренно не полагается на LLM — эти паттерны
 * механически выводятся из JournalEntry, поэтому надёжнее считать их здесь,
 * а не просить модель угадать по контексту.
 */
@Injectable()
export class BehaviorFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluateForUser(userId: string): Promise<void> {
    const recentEntries = await this.prisma.journalEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const detected: DetectedFlag[] = [
      ...this.detectOvertrading(recentEntries),
      ...this.detectNoStop(recentEntries),
      ...this.detectRevenge(recentEntries),
    ];

    for (const flag of detected) {
      await this.createIfNotDeduped(userId, flag);
    }
  }

  async getRecentKinds(userId: string, sinceMs: number): Promise<BehaviorFlagKind[]> {
    const since = new Date(Date.now() - sinceMs);
    const flags = await this.prisma.behaviorFlag.findMany({
      where: { userId, detectedAt: { gte: since } },
      select: { kind: true },
      distinct: ["kind"],
    });
    return flags.map((f) => f.kind);
  }

  async listForUser(userId: string) {
    return this.prisma.behaviorFlag.findMany({
      where: { userId },
      orderBy: { detectedAt: "desc" },
      take: 50,
    });
  }

  private detectOvertrading(entries: { createdAt: Date }[]): DetectedFlag[] {
    const since = new Date(Date.now() - OVERTRADING_WINDOW_MS);
    const countLast24h = entries.filter((e) => e.createdAt >= since).length;

    if (countLast24h < OVERTRADING_THRESHOLD) {
      return [];
    }

    return [
      {
        kind: BEHAVIOR_FLAG_KIND.OVERTRADING,
        payload: { tradesLast24h: countLast24h, threshold: OVERTRADING_THRESHOLD },
      },
    ];
  }

  private detectNoStop(entries: { side: string | null; stop: number | null }[]): DetectedFlag[] {
    const latest = entries[0];
    if (!latest || !latest.side || latest.stop !== null) {
      return [];
    }

    return [{ kind: BEHAVIOR_FLAG_KIND.NO_STOP, payload: { side: latest.side } }];
  }

  private detectRevenge(
    entries: { createdAt: Date; outcome: string | null; closedAt: Date | null }[],
  ): DetectedFlag[] {
    const [latest, previous] = entries;
    if (!latest || !previous || previous.outcome !== "LOSS" || !previous.closedAt) {
      return [];
    }

    const gapMs = latest.createdAt.getTime() - previous.closedAt.getTime();
    if (gapMs < 0 || gapMs > REVENGE_WINDOW_MS) {
      return [];
    }

    return [{ kind: BEHAVIOR_FLAG_KIND.REVENGE, payload: { gapMs, previousOutcome: previous.outcome } }];
  }

  private async createIfNotDeduped(userId: string, flag: DetectedFlag): Promise<void> {
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
    const existing = await this.prisma.behaviorFlag.findFirst({
      where: { userId, kind: flag.kind, detectedAt: { gte: since } },
    });
    if (existing) {
      return;
    }

    await this.prisma.behaviorFlag.create({
      data: { userId, kind: flag.kind, payload: flag.payload },
    });
  }
}

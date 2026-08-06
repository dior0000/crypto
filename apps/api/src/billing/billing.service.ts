import { Injectable } from "@nestjs/common";
import { FREE_PLAN_MONTHLY_ANALYSES, PLAN } from "@chartmate/shared";

import { PrismaService } from "../prisma/prisma.service";
import { AppError, APP_ERROR_CODE } from "../common/errors/app-error";

const PERIOD_LENGTH_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanRunAnalysis(userId: string): Promise<void> {
    const user = await this.resetPeriodIfElapsed(userId);

    if (user.plan === PLAN.PRO) {
      return;
    }

    if (user.analysesUsedThisPeriod >= FREE_PLAN_MONTHLY_ANALYSES) {
      throw new AppError(
        APP_ERROR_CODE.FREE_TIER_LIMIT_REACHED,
        `Достигнут лимит бесплатного тарифа: ${FREE_PLAN_MONTHLY_ANALYSES} анализов в месяц`,
      );
    }
  }

  async recordAnalysisUsed(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { analysesUsedThisPeriod: { increment: 1 } },
    });
  }

  private async resetPeriodIfElapsed(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.periodResetAt.getTime() > Date.now()) {
      return user;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        analysesUsedThisPeriod: 0,
        periodResetAt: new Date(Date.now() + PERIOD_LENGTH_MS),
      },
    });
  }
}

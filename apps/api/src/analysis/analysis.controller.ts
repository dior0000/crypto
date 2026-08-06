import { Controller, Get, NotFoundException, Param, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUserId } from "../common/decorators/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";

@Controller("api/frames/:frameId/analyses")
@UseGuards(JwtAuthGuard)
export class AnalysisController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listForFrame(@Param("frameId") frameId: string, @CurrentUserId() userId: string) {
    const frame = await this.prisma.frame.findUnique({
      where: { id: frameId },
      include: { session: true },
    });

    if (!frame || frame.session.userId !== userId) {
      throw new NotFoundException("Кадр не найден");
    }

    return this.prisma.analysis.findMany({
      where: { frameId },
      orderBy: { createdAt: "desc" },
    });
  }
}

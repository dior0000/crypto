import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TelegramService {
  constructor(private readonly prisma: PrismaService) {}

  async linkAccount(userId: string, tgId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { tgId } });
  }
}

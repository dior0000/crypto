import { CanActivate, ExecutionContext, Injectable, NotFoundException } from "@nestjs/common";
import type { Request } from "express";

import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedUser } from "../../auth/jwt.strategy";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@Injectable()
export class SessionOwnershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const sessionId = request.params.id;

    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== request.user.id) {
      throw new NotFoundException("Сессия не найдена");
    }

    return true;
  }
}

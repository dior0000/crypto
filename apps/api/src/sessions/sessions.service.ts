import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";

import { PrismaService } from "../prisma/prisma.service";
import { QUEUE_NAMES } from "../queue/queue.constants";
import { AppError, APP_ERROR_CODE } from "../common/errors/app-error";
import type { VisionJobData } from "../analysis/analysis.processor";

export interface SubmitFrameInput {
  sessionId: string;
  phash: string;
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png";
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.VISION) private readonly visionQueue: Queue<VisionJobData>,
  ) {}

  async startSession(userId: string) {
    return this.prisma.session.create({ data: { userId } });
  }

  async endSession(sessionId: string) {
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { endedAt: new Date() },
    });
  }

  async submitFrame(input: SubmitFrameInput) {
    // Владение сессией уже проверено SessionOwnershipGuard на контроллере.
    const session = await this.prisma.session.findUniqueOrThrow({ where: { id: input.sessionId } });

    if (session.endedAt) {
      throw new AppError(APP_ERROR_CODE.SESSION_NOT_ACTIVE, `Сессия ${input.sessionId} уже завершена`);
    }

    const frame = await this.prisma.frame.create({
      data: { sessionId: input.sessionId, phash: input.phash },
    });

    await this.visionQueue.add("analyze-frame", {
      frameId: frame.id,
      sessionId: input.sessionId,
      userId: session.userId,
      imageBase64: input.imageBase64,
      mediaType: input.mediaType,
    });

    return frame;
  }
}

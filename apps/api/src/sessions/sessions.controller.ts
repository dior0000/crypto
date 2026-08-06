import { Body, Controller, Param, Patch, Post, Sse, UseGuards } from "@nestjs/common";
import type { MessageEvent } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { fromEvent, Observable } from "rxjs";
import { filter, map } from "rxjs/operators";
import { z } from "zod";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUserId } from "../common/decorators/current-user.decorator";
import { SessionOwnershipGuard } from "../common/guards/session-ownership.guard";
import { ANALYSIS_UPDATE_EVENT, type AnalysisUpdateEvent } from "../analysis/analysis.events";
import { SessionsService } from "./sessions.service";

const SubmitFrameBodySchema = z.object({
  phash: z.string(),
  imageBase64: z.string(),
  mediaType: z.enum(["image/jpeg", "image/png"]),
});

@Controller("api/sessions")
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Post()
  async start(@CurrentUserId() userId: string) {
    return this.sessionsService.startSession(userId);
  }

  @Patch(":id/end")
  @UseGuards(SessionOwnershipGuard)
  async end(@Param("id") id: string) {
    return this.sessionsService.endSession(id);
  }

  @Post(":id/frames")
  @UseGuards(SessionOwnershipGuard)
  async submitFrame(@Param("id") id: string, @Body() body: unknown) {
    const parsed = SubmitFrameBodySchema.parse(body);
    return this.sessionsService.submitFrame({ sessionId: id, ...parsed });
  }

  @Sse(":id/analyses/stream")
  @UseGuards(SessionOwnershipGuard)
  streamAnalyses(@Param("id") id: string): Observable<MessageEvent> {
    return fromEvent<AnalysisUpdateEvent>(this.eventEmitter, ANALYSIS_UPDATE_EVENT).pipe(
      filter((event) => event.sessionId === id),
      map((event) => ({ data: event })),
    );
  }
}

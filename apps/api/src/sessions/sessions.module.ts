import { Module } from "@nestjs/common";

import { QueueModule } from "../queue/queue.module";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";

@Module({
  imports: [QueueModule],
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}

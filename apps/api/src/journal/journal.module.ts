import { Module } from "@nestjs/common";

import { BehaviorFlagsService } from "./behavior-flags.service";
import { JournalController } from "./journal.controller";
import { JournalService } from "./journal.service";

@Module({
  controllers: [JournalController],
  providers: [JournalService, BehaviorFlagsService],
  exports: [JournalService],
})
export class JournalModule {}

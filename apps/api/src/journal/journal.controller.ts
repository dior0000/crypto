import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JournalEntrySchema, JournalEntryUpdateSchema } from "@chartmate/shared";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUserId } from "../common/decorators/current-user.decorator";
import { BehaviorFlagsService } from "./behavior-flags.service";
import { JournalService } from "./journal.service";

@Controller("api/journal")
@UseGuards(JwtAuthGuard)
export class JournalController {
  constructor(
    private readonly journalService: JournalService,
    private readonly behaviorFlagsService: BehaviorFlagsService,
  ) {}

  @Post()
  async create(@CurrentUserId() userId: string, @Body() body: unknown) {
    const entry = JournalEntrySchema.parse(body);
    return this.journalService.createEntry(userId, entry);
  }

  @Get()
  async list(@CurrentUserId() userId: string) {
    return this.journalService.listEntries(userId);
  }

  @Patch(":id")
  async update(@CurrentUserId() userId: string, @Param("id") id: string, @Body() body: unknown) {
    const update = JournalEntryUpdateSchema.parse(body);
    return this.journalService.updateEntry(userId, id, update);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUserId() userId: string, @Param("id") id: string) {
    await this.journalService.deleteEntry(userId, id);
  }

  @Get("behavior-flags")
  async listBehaviorFlags(@CurrentUserId() userId: string) {
    return this.behaviorFlagsService.listForUser(userId);
  }
}

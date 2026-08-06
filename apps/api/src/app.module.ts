import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";

import { PrismaModule } from "./prisma/prisma.module";
import { QueueModule } from "./queue/queue.module";
import { AuthModule } from "./auth/auth.module";
import { VisionModule } from "./vision/vision.module";
import { MarketModule } from "./market/market.module";
import { NewsModule } from "./news/news.module";
import { AnalysisModule } from "./analysis/analysis.module";
import { JournalModule } from "./journal/journal.module";
import { BillingModule } from "./billing/billing.module";
import { TelegramModule } from "./telegram/telegram.module";
import { SessionsModule } from "./sessions/sessions.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    QueueModule,
    AuthModule,
    VisionModule,
    MarketModule,
    NewsModule,
    AnalysisModule,
    JournalModule,
    BillingModule,
    TelegramModule,
    SessionsModule,
  ],
})
export class AppModule {}

import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { QUEUE_NAMES } from "./queue.constants";

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.getOrThrow<string>("REDIS_URL"),
        },
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_NAMES.VISION }),
  ],
  exports: [BullModule],
})
export class QueueModule {}

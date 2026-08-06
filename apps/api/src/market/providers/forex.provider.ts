import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { TwelveDataProviderBase } from "./twelve-data.provider";

/** См. комментарий в equity.provider.ts — конструктор нужен, чтобы Nest DI получил ConfigService. */
@Injectable()
export class ForexProvider extends TwelveDataProviderBase {
  readonly assetClass = "FOREX" as const;

  constructor(config: ConfigService) {
    super(config);
  }
}

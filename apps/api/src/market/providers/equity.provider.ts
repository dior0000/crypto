import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { TwelveDataProviderBase } from "./twelve-data.provider";

/**
 * Конструктор продублирован намеренно: если его не объявить, tsc не эмитит
 * design:paramtypes для этого класса (эмитится только для классов с собственным
 * конструктором) — Nest DI получает undefined вместо ConfigService.
 */
@Injectable()
export class EquityProvider extends TwelveDataProviderBase {
  readonly assetClass = "EQUITY" as const;

  constructor(config: ConfigService) {
    super(config);
  }
}

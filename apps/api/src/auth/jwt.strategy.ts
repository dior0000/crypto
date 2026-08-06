import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { Request } from "express";

import type { AuthTokenPayload } from "./auth.service";

export interface AuthenticatedUser {
  id: string;
  email: string;
}

function extractFromQueryToken(req: Request): string | null {
  const token = req.query?.token;
  return typeof token === "string" ? token : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      // EventSource (для SSE) не умеет ставить заголовок Authorization,
      // поэтому токен также принимается через ?token= в query-строке.
      jwtFromRequest: ExtractJwt.fromExtractors([ExtractJwt.fromAuthHeaderAsBearerToken(), extractFromQueryToken]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_SECRET"),
    });
  }

  validate(payload: AuthTokenPayload): AuthenticatedUser {
    return { id: payload.sub, email: payload.email };
  }
}

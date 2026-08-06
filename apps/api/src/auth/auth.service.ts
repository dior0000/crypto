import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";

import { PrismaService } from "../prisma/prisma.service";
import { AppError, APP_ERROR_CODE } from "../common/errors/app-error";

const SALT_ROUNDS = 10;

export interface AuthTokenPayload {
  sub: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(email: string, password: string): Promise<{ id: string; email: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(APP_ERROR_CODE.EMAIL_ALREADY_REGISTERED, `Пользователь с email ${email} уже зарегистрирован`);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.prisma.user.create({ data: { email, passwordHash } });

    return { id: user.id, email: user.email ?? email };
  }

  async login(email: string, password: string): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      throw new AppError(APP_ERROR_CODE.INVALID_CREDENTIALS, "Неверный email или пароль");
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new AppError(APP_ERROR_CODE.INVALID_CREDENTIALS, "Неверный email или пароль");
    }

    const payload: AuthTokenPayload = { sub: user.id, email: user.email ?? email };
    return { accessToken: await this.jwtService.signAsync(payload) };
  }
}

import { Body, Controller, Post } from "@nestjs/common";
import { z } from "zod";

import { AuthService } from "./auth.service";

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

@Controller("api/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  async register(@Body() body: unknown) {
    const { email, password } = CredentialsSchema.parse(body);
    return this.authService.register(email, password);
  }

  @Post("login")
  async login(@Body() body: unknown) {
    const { email, password } = CredentialsSchema.parse(body);
    return this.authService.login(email, password);
  }
}

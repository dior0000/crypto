import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";

import { AppError, APP_ERROR_CODE } from "./app-error";

const STATUS_BY_CODE: Record<string, number> = {
  [APP_ERROR_CODE.FRAME_CONFIDENCE_TOO_LOW]: HttpStatus.UNPROCESSABLE_ENTITY,
  [APP_ERROR_CODE.FREE_TIER_LIMIT_REACHED]: HttpStatus.PAYMENT_REQUIRED,
  [APP_ERROR_CODE.GUARDRAIL_BLOCKED]: HttpStatus.UNPROCESSABLE_ENTITY,
  [APP_ERROR_CODE.SESSION_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [APP_ERROR_CODE.SESSION_NOT_ACTIVE]: HttpStatus.CONFLICT,
  [APP_ERROR_CODE.MARKET_DATA_UNAVAILABLE]: HttpStatus.BAD_GATEWAY,
  [APP_ERROR_CODE.EMAIL_ALREADY_REGISTERED]: HttpStatus.CONFLICT,
  [APP_ERROR_CODE.INVALID_CREDENTIALS]: HttpStatus.UNAUTHORIZED,
};

@Catch(AppError)
export class AppErrorFilter implements ExceptionFilter {
  catch(exception: AppError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      code: exception.code,
      message: exception.message,
      details: exception.details,
    });
  }
}

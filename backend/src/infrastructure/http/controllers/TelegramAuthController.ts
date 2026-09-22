import { Request, Response } from 'express';
import { TelegramLoginUseCase } from '../../../application/use-cases/auth/TelegramLoginUseCase';
import { AppError } from '../../../domain/errors/AppError';

export class TelegramAuthController {
  constructor(private readonly telegramLoginUseCase: TelegramLoginUseCase) {}

  async verifyPhone(request: Request, response: Response): Promise<Response> {
    const { phone } = request.query;

    if (!phone || typeof phone !== 'string') {
      throw AppError.badRequest('Phone number is required', 'MISSING_PHONE');
    }

    const result = await this.telegramLoginUseCase.verifyPhone({
      phoneNumber: phone,
    });

    return response.status(200).json({
      status: 'success',
      data: result,
    });
  }

  async sendOtp(request: Request, response: Response): Promise<Response> {
    const { phone, telegramUserId } = request.body;

    if (!phone) {
      throw AppError.badRequest('Phone number is required', 'MISSING_PHONE');
    }

    if (!telegramUserId) {
      throw AppError.badRequest('Telegram user ID is required', 'MISSING_TELEGRAM_ID');
    }

    const result = await this.telegramLoginUseCase.sendOtp({
      phoneNumber: phone,
      telegramUserId,
    });

    return response.status(200).json({
      status: 'success',
      data: result,
    });
  }

  async verifyOtp(request: Request, response: Response): Promise<Response> {
    const { phone, otp, telegramUserId, telegramUsername } = request.body;

    if (!phone) {
      throw AppError.badRequest('Phone number is required', 'MISSING_PHONE');
    }

    if (!otp) {
      throw AppError.badRequest('OTP is required', 'MISSING_OTP');
    }

    if (!telegramUserId) {
      throw AppError.badRequest('Telegram user ID is required', 'MISSING_TELEGRAM_ID');
    }

    const result = await this.telegramLoginUseCase.verifyOtp({
      phoneNumber: phone,
      otp,
      telegramUserId,
      telegramUsername,
    });

    return response.status(200).json({
      status: 'success',
      data: result,
    });
  }
}

import { Request, Response } from 'express';
import { GoogleLoginUseCase } from '../../../application/use-cases/auth/GoogleLoginUseCase';
import { AppError } from '../../../domain/errors/AppError';
import { clearAdminAccessCookie, getSessionCookieOptions } from '../utils/admin-access';

const AUTH_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export class GoogleAuthController {
  constructor(private readonly googleLoginUseCase: GoogleLoginUseCase) {}

  async login(request: Request, response: Response): Promise<Response> {
    const { idToken } = request.body;

    if (!idToken) {
      throw AppError.badRequest('Google ID token is required', 'MISSING_ID_TOKEN');
    }

    const result = await this.googleLoginUseCase.execute({ idToken });

    response.cookie(
      'auth_token',
      result.token,
      getSessionCookieOptions(request, AUTH_COOKIE_MAX_AGE_MS),
    );
    clearAdminAccessCookie(response, request);

    return response.status(200).json({
      status: 'success',
      data: result,
    });
  }
}

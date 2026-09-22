import { Request, Response } from 'express';
import { RegisterUseCase } from '../../../application/use-cases/auth/RegisterUseCase';
import { LoginUseCase } from '../../../application/use-cases/auth/LoginUseCase';
import { VerifyEmailUseCase } from '../../../application/use-cases/auth/VerifyEmailUseCase';
import { UpdatePasswordUseCase } from '../../../application/use-cases/auth/UpdatePasswordUseCase';
import { LogoutUseCase } from '../../../application/use-cases/auth/LogoutUseCase';
import { ForgotPasswordUseCase } from '../../../application/use-cases/auth/ForgotPasswordUseCase';
import { ResetPasswordUseCase } from '../../../application/use-cases/auth/ResetPasswordUseCase';
import { AppError } from '../../../domain/errors/AppError';
import {
  clearAdminAccessCookie,
  getSessionCookieBaseOptions,
  getSessionCookieOptions,
} from '../utils/admin-access';

const AUTH_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    private readonly updatePasswordUseCase: UpdatePasswordUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
  ) {}

  async register(request: Request, response: Response): Promise<Response> {
    const { email, password, name, surname, fiscalCode, phoneNumber, address, inviteCode } =
      request.body;

    if (!email || !password || !name || !inviteCode) {
      throw AppError.badRequest(
        'Missing required fields: email, password, name, inviteCode',
        'MISSING_FIELDS',
      );
    }

    try {
      const user = await this.registerUseCase.execute({
        email,
        password,
        name,
        inviteCode,
        surname,
        fiscalCode,
        phoneNumber,
        address,
      });

      return response.status(201).json({
        status: 'success',
        data: {
          user,
          message: 'User registered successfully',
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        throw AppError.conflict(error.message, 'USER_EXISTS');
      }
      throw AppError.internal(error instanceof Error ? error.message : 'Registration failed');
    }
  }

  async login(request: Request, response: Response): Promise<Response> {
    const { email, password } = request.body;

    if (!email || !password) {
      throw AppError.badRequest('Email and password are required', 'MISSING_CREDENTIALS');
    }

    try {
      const result = await this.loginUseCase.execute({
        email,
        password,
      });

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
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw AppError.unauthorized(error.message, 'INVALID_CREDENTIALS');
    }
  }

  async verifyEmail(request: Request, response: Response): Promise<Response> {
    const { token } = request.query;

    if (!token) {
      throw AppError.badRequest('Token is required', 'MISSING_TOKEN');
    }

    try {
      await this.verifyEmailUseCase.execute({
        token: token as string,
      });

      return response.status(200).json({
        status: 'success',
        message: 'Email verified successfully',
      });
    } catch (error) {
      throw AppError.badRequest(error.message, 'INVALID_TOKEN');
    }
  }

  async updatePassword(request: Request, response: Response): Promise<Response> {
    const { oldPassword, newPassword, confirmPassword } = request.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
      throw AppError.badRequest(
        'Missing required fields: oldPassword, newPassword, confirmPassword',
        'MISSING_FIELDS',
      );
    }

    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'NOT_AUTHENTICATED');
    }

    const updatedUser = await this.updatePasswordUseCase.execute({
      userId: request.user.id,
      oldPassword,
      newPassword,
      confirmPassword,
    });

    return response.status(200).json({
      status: 'success',
      data: {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
        },
        message: 'Password updated successfully',
      },
    });
  }

  /**
   * Logout: clears auth cookie and returns 200. Does not require a valid token,
   * so the frontend can call this after session expiry without getting 401.
   */
  async logout(request: Request, response: Response): Promise<Response> {
    if (request.user?.id) {
      await this.logoutUseCase.execute();
    }
    response.clearCookie('auth_token', getSessionCookieBaseOptions(request));
    clearAdminAccessCookie(response, request);
    return response.status(200).json({
      status: 'success',
      message: 'Logout successful',
    });
  }

  async forgotPassword(request: Request, response: Response): Promise<Response> {
    const { email } = request.body;

    if (!email) {
      throw AppError.badRequest('Email is required', 'MISSING_EMAIL');
    }

    await this.forgotPasswordUseCase.execute({ email });

    return response.status(200).json({
      status: 'success',
      message: 'If the email exists, a password reset link has been sent',
    });
  }

  async resetPassword(request: Request, response: Response): Promise<Response> {
    const { token, newPassword, confirmPassword } = request.body;

    if (!token || !newPassword || !confirmPassword) {
      throw AppError.badRequest(
        'Missing required fields: token, newPassword, confirmPassword',
        'MISSING_FIELDS',
      );
    }

    await this.resetPasswordUseCase.execute({ token, newPassword, confirmPassword });

    return response.status(200).json({
      status: 'success',
      message: 'Password reset successfully',
    });
  }
}

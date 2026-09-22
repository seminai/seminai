import { AuthController } from '../infrastructure/http/controllers/AuthController';
import { Request, Response } from 'express';
import { RegisterUseCase } from '../application/use-cases/auth/RegisterUseCase';
import { LoginUseCase } from '../application/use-cases/auth/LoginUseCase';
import { VerifyEmailUseCase } from '../application/use-cases/auth/VerifyEmailUseCase';
import { UpdatePasswordUseCase } from '../application/use-cases/auth/UpdatePasswordUseCase';
import { IUserRepository } from '../domain/repositories/IUserRepository';
import { AppError } from '../domain/errors/AppError';
import { LogoutUseCase } from '../application/use-cases/auth/LogoutUseCase';
import { ForgotPasswordUseCase } from '../application/use-cases/auth/ForgotPasswordUseCase';
import { ResetPasswordUseCase } from '../application/use-cases/auth/ResetPasswordUseCase';

jest.mock('../application/use-cases/auth/RegisterUseCase');
jest.mock('../application/use-cases/auth/LoginUseCase');
jest.mock('../application/use-cases/auth/VerifyEmailUseCase');
jest.mock('../application/use-cases/auth/UpdatePasswordUseCase');
jest.mock('../application/use-cases/auth/LogoutUseCase');
jest.mock('../application/use-cases/auth/ForgotPasswordUseCase');
jest.mock('../application/use-cases/auth/ResetPasswordUseCase');
describe('AuthController', () => {
  let authController: AuthController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let registerUseCase: jest.Mocked<RegisterUseCase>;
  let loginUseCase: jest.Mocked<LoginUseCase>;
  let verifyEmailUseCase: jest.Mocked<VerifyEmailUseCase>;
  let updatePasswordUseCase: jest.Mocked<UpdatePasswordUseCase>;
  let mockUserRepository: jest.Mocked<IUserRepository>;
  let logoutUseCase: jest.Mocked<LogoutUseCase>;
  let forgotPasswordUseCase: jest.Mocked<ForgotPasswordUseCase>;
  let resetPasswordUseCase: jest.Mocked<ResetPasswordUseCase>;

  beforeEach(() => {
    mockUserRepository = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findByPhoneNumber: jest.fn(),
      findByGoogleId: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deductCredits: jest.fn(),
    } as jest.Mocked<IUserRepository>;

    registerUseCase = jest.mocked(new RegisterUseCase(mockUserRepository));
    loginUseCase = jest.mocked(new LoginUseCase(mockUserRepository));
    verifyEmailUseCase = jest.mocked(new VerifyEmailUseCase(mockUserRepository));
    updatePasswordUseCase = jest.mocked(new UpdatePasswordUseCase(mockUserRepository));
    logoutUseCase = jest.mocked(new LogoutUseCase());
    forgotPasswordUseCase = jest.mocked(new ForgotPasswordUseCase(mockUserRepository));
    resetPasswordUseCase = jest.mocked(new ResetPasswordUseCase(mockUserRepository));

    authController = new AuthController(
      registerUseCase,
      loginUseCase,
      verifyEmailUseCase,
      updatePasswordUseCase,
      logoutUseCase,
      forgotPasswordUseCase,
      resetPasswordUseCase,
    );
    mockRequest = {
      headers: {},
      secure: false,
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
    } as unknown as Partial<Response>;
  });

  describe('forgotPassword', () => {
    it('should return success response', async () => {
      mockRequest = {
        body: { email: 'test@example.com' },
      };

      jest.spyOn(forgotPasswordUseCase, 'execute').mockResolvedValue();

      await authController.forgotPassword(mockRequest as Request, mockResponse as Response);

      expect(forgotPasswordUseCase.execute).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'If the email exists, a password reset link has been sent',
      });
    });

    it('should return same success response for non-existing email', async () => {
      mockRequest = {
        body: { email: 'nonexistent@example.com' },
      };

      jest.spyOn(forgotPasswordUseCase, 'execute').mockResolvedValue();

      await authController.forgotPassword(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'If the email exists, a password reset link has been sent',
      });
    });

    it('should throw error when email is missing', async () => {
      mockRequest = {
        body: {},
      };

      await expect(
        authController.forgotPassword(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('resetPassword', () => {
    it('should reset password successfully', async () => {
      mockRequest = {
        body: {
          token: 'valid-reset-token',
          newPassword: 'NewPassword123!',
          confirmPassword: 'NewPassword123!',
        },
      };

      jest.spyOn(resetPasswordUseCase, 'execute').mockResolvedValue();

      await authController.resetPassword(mockRequest as Request, mockResponse as Response);

      expect(resetPasswordUseCase.execute).toHaveBeenCalledWith({
        token: 'valid-reset-token',
        newPassword: 'NewPassword123!',
        confirmPassword: 'NewPassword123!',
      });
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Password reset successfully',
      });
    });

    it('should throw error when required fields are missing', async () => {
      mockRequest = {
        body: {
          token: 'valid-reset-token',
          newPassword: 'NewPassword123!',
        },
      };

      await expect(
        authController.resetPassword(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should handle invalid token error', async () => {
      mockRequest = {
        body: {
          token: 'invalid-token',
          newPassword: 'NewPassword123!',
          confirmPassword: 'NewPassword123!',
        },
      };

      jest
        .spyOn(resetPasswordUseCase, 'execute')
        .mockRejectedValue(AppError.badRequest('Invalid or expired reset token', 'INVALID_TOKEN'));

      await expect(
        authController.resetPassword(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });});

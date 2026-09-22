import { AuthController } from '../infrastructure/http/controllers/AuthController';
import { Request, Response } from 'express';
import { RegisterUseCase } from '../application/use-cases/auth/RegisterUseCase';
import { LoginUseCase } from '../application/use-cases/auth/LoginUseCase';
import { VerifyEmailUseCase } from '../application/use-cases/auth/VerifyEmailUseCase';
import { UpdatePasswordUseCase } from '../application/use-cases/auth/UpdatePasswordUseCase';
import { IUserRepository } from '../domain/repositories/IUserRepository';
import { User } from '../domain/entities/User';
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

  describe('updatePassword', () => {
    it('should update password successfully', async () => {
      const inputOldPassword = 'OldPassword123!';
      const inputNewPassword = 'NewPassword123!';
      const inputConfirmPassword = 'NewPassword123!';

      mockRequest = {
        body: {
          oldPassword: inputOldPassword,
          newPassword: inputNewPassword,
          confirmPassword: inputConfirmPassword,
        },
        user: {
          id: 'user-id-123',
          email: 'test@example.com',
          name: 'Test User',
        },
      };

      const expectedUpdatedUser = new User(
        'user-id-123',
        'test@example.com',
        'newHashedPassword',
        'Test User',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        'BASIC',
        10,
        true,
        new Date(),
        new Date(),
      );

      jest.spyOn(updatePasswordUseCase, 'execute').mockResolvedValue(expectedUpdatedUser);

      await authController.updatePassword(mockRequest as Request, mockResponse as Response);

      expect(updatePasswordUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-id-123',
        oldPassword: inputOldPassword,
        newPassword: inputNewPassword,
        confirmPassword: inputConfirmPassword,
      });

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          user: {
            id: expectedUpdatedUser.id,
            email: expectedUpdatedUser.email,
            name: expectedUpdatedUser.name,
          },
          message: 'Password updated successfully',
        },
      });
    });

    it('should throw error when required fields are missing', async () => {
      mockRequest = {
        body: {
          oldPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
        },
        user: {
          id: 'user-id-123',
        },
      };

      await expect(
        authController.updatePassword(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should throw error when user is not authenticated', async () => {
      mockRequest = {
        body: {
          oldPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
          confirmPassword: 'NewPassword123!',
        },
      };

      await expect(
        authController.updatePassword(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should handle password mismatch error', async () => {
      const inputOldPassword = 'OldPassword123!';
      const inputNewPassword = 'NewPassword123!';
      const inputConfirmPassword = 'DifferentPassword123!';

      mockRequest = {
        body: {
          oldPassword: inputOldPassword,
          newPassword: inputNewPassword,
          confirmPassword: inputConfirmPassword,
        },
        user: {
          id: 'user-id-123',
        },
      };

      jest
        .spyOn(updatePasswordUseCase, 'execute')
        .mockRejectedValue(
          AppError.badRequest('New password and confirmation do not match', 'PASSWORD_MISMATCH'),
        );

      await expect(
        authController.updatePassword(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should handle incorrect old password error', async () => {
      const inputOldPassword = 'WrongOldPassword';
      const inputNewPassword = 'NewPassword123!';
      const inputConfirmPassword = 'NewPassword123!';

      mockRequest = {
        body: {
          oldPassword: inputOldPassword,
          newPassword: inputNewPassword,
          confirmPassword: inputConfirmPassword,
        },
        user: {
          id: 'user-id-123',
        },
      };

      jest
        .spyOn(updatePasswordUseCase, 'execute')
        .mockRejectedValue(
          AppError.unauthorized('Old password is incorrect', 'INVALID_OLD_PASSWORD'),
        );

      await expect(
        authController.updatePassword(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should handle password too short error', async () => {
      const inputOldPassword = 'OldPassword123!';
      const inputNewPassword = '12345';
      const inputConfirmPassword = '12345';

      mockRequest = {
        body: {
          oldPassword: inputOldPassword,
          newPassword: inputNewPassword,
          confirmPassword: inputConfirmPassword,
        },
        user: {
          id: 'user-id-123',
        },
      };

      jest
        .spyOn(updatePasswordUseCase, 'execute')
        .mockRejectedValue(
          AppError.badRequest(
            'New password must be at least 6 characters long',
            'PASSWORD_TOO_SHORT',
          ),
        );

      await expect(
        authController.updatePassword(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });});

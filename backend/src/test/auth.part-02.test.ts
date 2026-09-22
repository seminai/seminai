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

  describe('verifyEmail', () => {
    it('should verify email successfully', async () => {
      const mockToken = 'valid-verification-token';

      mockRequest = {
        query: { token: mockToken },
      };

      jest.spyOn(verifyEmailUseCase, 'execute').mockResolvedValue();

      await authController.verifyEmail(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Email verified successfully',
      });
    });

    it('should handle invalid verification token', async () => {
      const mockToken = 'invalid-token';

      mockRequest = {
        query: { token: mockToken },
      };

      jest
        .spyOn(verifyEmailUseCase, 'execute')
        .mockRejectedValue(new AppError(400, 'Invalid verification token', 'INVALID_TOKEN'));

      await expect(
        authController.verifyEmail(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });});

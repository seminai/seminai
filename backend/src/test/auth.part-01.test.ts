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

  describe('register', () => {
    it('should register a new user successfully with all fields', async () => {
      const mockUser = {
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
        inviteCode: 'INVITE-CODE-123',
        surname: 'User Surname',
        fiscalCode: 'TSTUSRXX00A00X000X',
        phoneNumber: '+393331234567',
        address: 'Via Test 123, 00100 Roma',
      };

      mockRequest = {
        body: mockUser,
      };

      const mockRegisteredUser = new User(
        '1',
        mockUser.email,
        'hashedPassword',
        mockUser.name,
        mockUser.surname,
        mockUser.fiscalCode,
        null,
        null,
        mockUser.phoneNumber,
        mockUser.address,
        null,
        'BASIC',
        10,
        false,
        new Date(),
        new Date(),
      );

      jest.spyOn(registerUseCase, 'execute').mockResolvedValue(mockRegisteredUser);

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          user: mockRegisteredUser,
          message: 'User registered successfully',
        },
      });
    });

    it('should register a new user successfully with only required fields', async () => {
      const mockUser = {
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
        inviteCode: 'INVITE-CODE-123',
      };

      mockRequest = {
        body: mockUser,
      };

      const mockRegisteredUser = new User(
        '1',
        mockUser.email,
        'hashedPassword',
        mockUser.name,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        'BASIC',
        10,
        false,
        new Date(),
        new Date(),
      );

      jest.spyOn(registerUseCase, 'execute').mockResolvedValue(mockRegisteredUser);

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          user: mockRegisteredUser,
          message: 'User registered successfully',
        },
      });
    });

    it('should handle registration error', async () => {
      const mockUser = {
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
        inviteCode: 'INVITE-CODE-123',
        surname: 'User Surname',
        fiscalCode: 'TSTUSRXX00A00X000X',
        phoneNumber: '+393331234567',
        address: 'Via Test 123, 00100 Roma',
      };

      mockRequest = {
        body: mockUser,
      };

      jest
        .spyOn(registerUseCase, 'execute')
        .mockRejectedValue(new AppError(409, 'Email already exists', 'USER_EXISTS'));

      await expect(
        authController.register(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      const mockCredentials = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      mockRequest = {
        body: mockCredentials,
        headers: {},
        secure: false,
      };

      const mockLoginResult = {
        token: 'jwt-token',
        user: {
          id: '1',
          email: mockCredentials.email,
          name: 'Test User',
          role: 'BASIC',
          credits: 10,
        },
      };

      jest.spyOn(loginUseCase, 'execute').mockResolvedValue(mockLoginResult);

      await authController.login(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockLoginResult,
      });
    });

    it('should handle invalid credentials', async () => {
      const mockCredentials = {
        email: 'test@example.com',
        password: 'WrongPassword',
      };

      mockRequest = {
        body: mockCredentials,
        headers: {},
        secure: false,
      };

      jest
        .spyOn(loginUseCase, 'execute')
        .mockRejectedValue(new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS'));

      await expect(
        authController.login(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });});

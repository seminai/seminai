import { UserOnCompanyController } from '../infrastructure/http/controllers/UserOnCompanyController';
import { Request, Response } from 'express';
import { AddUserToCompanyUseCase } from '../application/use-cases/user-on-company/AddUserToCompanyUseCase';
import { UpdateUserRoleUseCase } from '../application/use-cases/user-on-company/UpdateUserRoleUseCase';
import { RemoveUserFromCompanyUseCase } from '../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase';
import { ResendCompanyInvitationUseCase } from '../application/use-cases/user-on-company/ResendCompanyInvitationUseCase';
import { IUserOnCompanyRepository } from '../domain/repositories/IUserOnCompanyRepository';
import { ICompanyRepository } from '../domain/repositories/ICompanyRepository';
import { IUserRepository } from '../domain/repositories/IUserRepository';
import { AppError } from '../domain/errors/AppError';
import { CompanyRole } from '@prisma/client';

jest.mock('../application/use-cases/user-on-company/AddUserToCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/UpdateUserRoleUseCase');
jest.mock('../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/ResendCompanyInvitationUseCase');
describe('UserOnCompanyController', () => {
  let userOnCompanyController: UserOnCompanyController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let addUserToCompanyUseCase: jest.Mocked<AddUserToCompanyUseCase>;
  let updateUserRoleUseCase: jest.Mocked<UpdateUserRoleUseCase>;
  let removeUserFromCompanyUseCase: jest.Mocked<RemoveUserFromCompanyUseCase>;
  let resendCompanyInvitationUseCase: jest.Mocked<ResendCompanyInvitationUseCase>;
  let mockUserOnCompanyRepository: jest.Mocked<IUserOnCompanyRepository>;
  let mockCompanyRepository: jest.Mocked<ICompanyRepository>;
  let mockUserRepository: jest.Mocked<IUserRepository>;

  beforeEach(() => {
    mockUserOnCompanyRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByCompanyId: jest.fn(),
      findByUserId: jest.fn(),
      findByCompanyAndUser: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteByCompanyAndUser: jest.fn(),
      findByCompanyIdWithDetails: jest.fn(),
      findByUserIdWithDetails: jest.fn(),
    } as jest.Mocked<IUserOnCompanyRepository>;

    mockCompanyRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByVatNumber: jest.fn(),
      findByFiscalCode: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteWithAllData: jest.fn(),
      getCourierEmail: jest.fn(),
      setCourierEmail: jest.fn(),
      findManyByUserId: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
    } as jest.Mocked<ICompanyRepository>;

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

    addUserToCompanyUseCase = jest.mocked(
      new AddUserToCompanyUseCase(
        mockUserOnCompanyRepository,
        mockCompanyRepository,
        mockUserRepository,
      ),
    );

    updateUserRoleUseCase = jest.mocked(new UpdateUserRoleUseCase(mockUserOnCompanyRepository));

    removeUserFromCompanyUseCase = jest.mocked(
      new RemoveUserFromCompanyUseCase(mockUserOnCompanyRepository),
    );

    resendCompanyInvitationUseCase = jest.mocked(
      new ResendCompanyInvitationUseCase(
        mockUserOnCompanyRepository,
        mockCompanyRepository,
        mockUserRepository,
      ),
    );

    userOnCompanyController = new UserOnCompanyController(
      mockUserOnCompanyRepository,
      mockCompanyRepository,
      mockUserRepository,
      addUserToCompanyUseCase,
      updateUserRoleUseCase,
      removeUserFromCompanyUseCase,
      resendCompanyInvitationUseCase,
    );

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn(),
    } as unknown as Partial<Response>;
  });

  describe('addUserToCompany', () => {

    it('should throw error when user is not authenticated', async () => {
      mockRequest = {
        body: {
          companyId: 'company-123',
          email: 'user@example.com',
          name: 'Test User',
          role: CompanyRole.EDITOR,
        },
      };

      await expect(
        userOnCompanyController.addUserToCompany(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });});});

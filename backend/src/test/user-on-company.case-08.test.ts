import { UserOnCompanyController } from '../infrastructure/http/controllers/UserOnCompanyController';
import { Request, Response } from 'express';
import { AddUserToCompanyUseCase } from '../application/use-cases/user-on-company/AddUserToCompanyUseCase';
import { UpdateUserRoleUseCase } from '../application/use-cases/user-on-company/UpdateUserRoleUseCase';
import { RemoveUserFromCompanyUseCase } from '../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase';
import { ResendCompanyInvitationUseCase } from '../application/use-cases/user-on-company/ResendCompanyInvitationUseCase';
import { IUserOnCompanyRepository } from '../domain/repositories/IUserOnCompanyRepository';
import { ICompanyRepository } from '../domain/repositories/ICompanyRepository';
import { IUserRepository } from '../domain/repositories/IUserRepository';
import { Company } from '../domain/entities/Company';
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

  describe('getUsersByCompany', () => {
    it('should return all users of a company', async () => {
      mockRequest = {
        params: { companyId: 'company-123' },
        user: { id: 'user-123' },
      };

      const mockCompany = new Company(
        'company-123',
        'Test Company',
        '12345678901',
        null,
        'TSTCMP12A34B567C',
        'Italy',
        'Rome',
        'Via Test 123',
        '00100',
        'test@company.com',
        '+393331234567',
        'https://testcompany.com',
        'https://testcompany.com/logo.png',
        new Date(),
        new Date(),
      );

      const expectedUsers = [
        {
          id: 'uoc-1',
          companyId: 'company-123',
          userId: 'user-1',
          type: null,
          role: CompanyRole.ADMIN,
          user: {
            id: 'user-1',
            name: 'User One',
            email: 'user1@example.com',
            surname: 'One',
            phoneNumber: '+393331111111',
            profilePictureUrl: null,
            lastAccessAt: new Date(),
            invitationPending: false,
          },
          company: {
            id: 'company-123',
            name: 'Test Company',
            email: 'test@company.com',
            vatNumber: '12345678901',
            fiscalCode: 'ABCDEFG12H34I567L',
          },
        },
        {
          id: 'uoc-2',
          companyId: 'company-123',
          userId: 'user-2',
          type: null,
          role: CompanyRole.EDITOR,
          user: {
            id: 'user-2',
            name: 'User Two',
            email: 'user2@example.com',
            surname: 'Two',
            phoneNumber: '+393332222222',
            profilePictureUrl: null,
            lastAccessAt: null,
            invitationPending: true,
          },
          company: {
            id: 'company-123',
            name: 'Test Company',
            email: 'test@company.com',
            vatNumber: '12345678901',
            fiscalCode: 'ABCDEFG12H34I567L',
          },
        },
        {
          id: 'uoc-3',
          companyId: 'company-123',
          userId: 'user-3',
          type: null,
          role: CompanyRole.VIEWER,
          user: {
            id: 'user-3',
            name: 'User Three',
            email: 'user3@example.com',
            surname: 'Three',
            phoneNumber: '+393333333333',
            profilePictureUrl: null,
            lastAccessAt: new Date(),
            invitationPending: false,
          },
          company: {
            id: 'company-123',
            name: 'Test Company',
            email: 'test@company.com',
            vatNumber: '12345678901',
            fiscalCode: 'ABCDEFG12H34I567L',
          },
        },
      ];

      mockCompanyRepository.findById.mockResolvedValue(mockCompany);
      mockUserOnCompanyRepository.findByCompanyIdWithDetails.mockResolvedValue(expectedUsers);

      await userOnCompanyController.getUsersByCompany(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(mockCompanyRepository.findById).toHaveBeenCalledWith('company-123');
      expect(mockUserOnCompanyRepository.findByCompanyIdWithDetails).toHaveBeenCalledWith(
        'company-123',
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { users: expectedUsers },
      });
    });});});

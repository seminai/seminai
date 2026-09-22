import { UserOnCompanyController } from '../infrastructure/http/controllers/UserOnCompanyController';
import { Request, Response } from 'express';
import { AddUserToCompanyUseCase } from '../application/use-cases/user-on-company/AddUserToCompanyUseCase';
import { UpdateUserRoleUseCase } from '../application/use-cases/user-on-company/UpdateUserRoleUseCase';
import { RemoveUserFromCompanyUseCase } from '../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase';
import { ResendCompanyInvitationUseCase } from '../application/use-cases/user-on-company/ResendCompanyInvitationUseCase';
import { IUserOnCompanyRepository } from '../domain/repositories/IUserOnCompanyRepository';
import { ICompanyRepository } from '../domain/repositories/ICompanyRepository';
import { IUserRepository } from '../domain/repositories/IUserRepository';
import { User } from '../domain/entities/User';
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

  describe('getCompaniesByUser', () => {
    it('should return all companies of a user', async () => {
      mockRequest = {
        params: { userId: 'user-123' },
        user: { id: 'user-123' },
      };

      const mockUser = new User(
        'user-123',
        'test@example.com',
        'hashedPassword',
        'Test',
        'User',
        'TSTUSRXX00A00X000X',
        null,
        null,
        '+393331234567',
        'Via Test 123',
        null,
        'BASIC',
        10,
        true,
        new Date(),
        new Date(),
      );

      const expectedCompanies = [
        {
          id: 'uoc-1',
          companyId: 'company-1',
          userId: 'user-123',
          type: null,
          role: CompanyRole.ADMIN,
          company: {
            id: 'company-1',
            name: 'Company One',
            email: 'company1@example.com',
            vatNumber: '11111111111',
            fiscalCode: 'AAAAA11A11A111A',
            city: 'Roma',
            address: 'Via Roma 1',
            phoneNumber: '+390611111111',
            website: 'https://company1.com',
            logoUrl: 'https://company1.com/logo.png',
          },
        },
        {
          id: 'uoc-2',
          companyId: 'company-2',
          userId: 'user-123',
          type: null,
          role: CompanyRole.EDITOR,
          company: {
            id: 'company-2',
            name: 'Company Two',
            email: 'company2@example.com',
            vatNumber: '22222222222',
            fiscalCode: 'BBBBB22B22B222B',
            city: 'Milano',
            address: 'Via Milano 2',
            phoneNumber: '+390222222222',
            website: 'https://company2.com',
            logoUrl: null,
          },
        },
      ];

      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockUserOnCompanyRepository.findByUserIdWithDetails.mockResolvedValue(expectedCompanies);

      await userOnCompanyController.getCompaniesByUser(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(mockUserRepository.findById).toHaveBeenCalledWith('user-123');
      expect(mockUserOnCompanyRepository.findByUserIdWithDetails).toHaveBeenCalledWith('user-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { companies: expectedCompanies },
      });
    });});});

import { UserOnCompanyController } from '../infrastructure/http/controllers/UserOnCompanyController';
import { Request, Response } from 'express';
import { AddUserToCompanyUseCase } from '../application/use-cases/user-on-company/AddUserToCompanyUseCase';
import { UpdateUserRoleUseCase } from '../application/use-cases/user-on-company/UpdateUserRoleUseCase';
import { RemoveUserFromCompanyUseCase } from '../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase';
import { ResendCompanyInvitationUseCase } from '../application/use-cases/user-on-company/ResendCompanyInvitationUseCase';
import { IUserOnCompanyRepository } from '../domain/repositories/IUserOnCompanyRepository';
import { ICompanyRepository } from '../domain/repositories/ICompanyRepository';
import { IUserRepository } from '../domain/repositories/IUserRepository';
import { UserOnCompany } from '../domain/entities/UserOnCompany';
import { Company } from '../domain/entities/Company';
import { User } from '../domain/entities/User';
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
    it('should add an existing user to a company successfully', async () => {
      const inputData = {
        companyId: 'company-123',
        email: 'existinguser@example.com',
        name: 'Existing User',
        role: CompanyRole.EDITOR,
      };

      mockRequest = {
        body: inputData,
        user: {
          id: 'admin-user-123',
          email: 'admin@example.com',
          name: 'Admin User',
        },
      };

      const expectedUserOnCompany = new UserOnCompany(
        'user-on-company-789',
        inputData.companyId,
        'user-456',
        null,
        inputData.role,
      );

      jest.spyOn(addUserToCompanyUseCase, 'execute').mockResolvedValue(expectedUserOnCompany);

      await userOnCompanyController.addUserToCompany(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(addUserToCompanyUseCase.execute).toHaveBeenCalledWith({
        companyId: inputData.companyId,
        email: inputData.email,
        name: inputData.name,
        role: inputData.role,
        invitedBy: 'Admin User',
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { userOnCompany: expectedUserOnCompany },
      });
    });

    it('should invite a new user and add to company successfully', async () => {
      const inputData = {
        companyId: 'company-123',
        email: 'newuser@example.com',
        name: 'New User',
        role: CompanyRole.VIEWER,
      };

      mockRequest = {
        body: inputData,
        user: {
          id: 'admin-user-123',
          email: 'admin@example.com',
          name: 'Admin User',
        },
      };

      const expectedUserOnCompany = new UserOnCompany(
        'user-on-company-999',
        inputData.companyId,
        'new-user-789',
        null,
        inputData.role,
      );

      jest.spyOn(addUserToCompanyUseCase, 'execute').mockResolvedValue(expectedUserOnCompany);

      await userOnCompanyController.addUserToCompany(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(addUserToCompanyUseCase.execute).toHaveBeenCalledWith({
        companyId: inputData.companyId,
        email: inputData.email,
        name: inputData.name,
        role: inputData.role,
        invitedBy: 'Admin User',
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { userOnCompany: expectedUserOnCompany },
      });
    });

    it('should throw error when required fields are missing', async () => {
      mockRequest = {
        body: {
          companyId: 'company-123',
          email: 'test@example.com',
        },
        user: {
          id: 'admin-user-123',
          name: 'Admin User',
        },
      };

      await expect(
        userOnCompanyController.addUserToCompany(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should throw error when role is invalid', async () => {
      mockRequest = {
        body: {
          companyId: 'company-123',
          email: 'user@example.com',
          name: 'Test User',
          role: 'INVALID_ROLE',
        },
        user: {
          id: 'admin-user-123',
          name: 'Admin User',
        },
      };

      await expect(
        userOnCompanyController.addUserToCompany(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError.badRequest('Invalid role', 'INVALID_ROLE'));
    });

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
    });

    it('should handle user already in company error', async () => {
      const inputData = {
        companyId: 'company-123',
        email: 'existing@example.com',
        name: 'Existing User',
        role: CompanyRole.VIEWER,
      };

      mockRequest = {
        body: inputData,
        user: {
          id: 'admin-user-123',
          name: 'Admin User',
        },
      };

      jest
        .spyOn(addUserToCompanyUseCase, 'execute')
        .mockRejectedValue(
          AppError.conflict('User already belongs to this company', 'USER_ALREADY_IN_COMPANY'),
        );

      await expect(
        userOnCompanyController.addUserToCompany(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should handle company not found error', async () => {
      const inputData = {
        companyId: 'non-existent-company',
        email: 'user@example.com',
        name: 'Test User',
        role: CompanyRole.ADMIN,
      };

      mockRequest = {
        body: inputData,
        user: {
          id: 'admin-user-123',
          name: 'Admin User',
        },
      };

      jest
        .spyOn(addUserToCompanyUseCase, 'execute')
        .mockRejectedValue(AppError.notFound('Company not found', 'COMPANY_NOT_FOUND'));

      await expect(
        userOnCompanyController.addUserToCompany(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
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
    });

    it('should throw error when company not found', async () => {
      mockRequest = {
        params: { companyId: 'non-existent-company' },
        user: { id: 'user-123' },
      };

      mockCompanyRepository.findById.mockResolvedValue(null);

      await expect(
        userOnCompanyController.getUsersByCompany(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError.notFound('Company not found', 'COMPANY_NOT_FOUND'));
    });
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
    });

    it('should throw error when user not found', async () => {
      mockRequest = {
        params: { userId: 'non-existent-user' },
        user: { id: 'user-123' },
      };

      mockUserRepository.findById.mockResolvedValue(null);

      await expect(
        userOnCompanyController.getCompaniesByUser(
          mockRequest as Request,
          mockResponse as Response,
        ),
      ).rejects.toThrow(AppError.notFound('User not found', 'USER_NOT_FOUND'));
    });
  });

  describe('updateUserRole', () => {
    it('should update user role successfully', async () => {
      const inputData = {
        id: 'user-on-company-123',
        role: CompanyRole.ADMIN,
      };

      mockRequest = {
        params: { id: inputData.id },
        body: { role: inputData.role },
        user: { id: 'admin-user-123' },
      };

      const expectedUpdatedUserOnCompany = new UserOnCompany(
        inputData.id,
        'company-123',
        'user-456',
        null,
        inputData.role,
      );

      jest.spyOn(updateUserRoleUseCase, 'execute').mockResolvedValue(expectedUpdatedUserOnCompany);

      await userOnCompanyController.updateUserRole(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(updateUserRoleUseCase.execute).toHaveBeenCalledWith({
        userOnCompanyId: inputData.id,
        role: inputData.role,
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { userOnCompany: expectedUpdatedUserOnCompany },
      });
    });

    it('should throw error when role is missing', async () => {
      mockRequest = {
        params: { id: 'user-on-company-123' },
        body: {},
        user: { id: 'admin-user-123' },
      };

      await expect(
        userOnCompanyController.updateUserRole(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError.badRequest('Role is required', 'MISSING_ROLE'));
    });

    it('should throw error when role is invalid', async () => {
      mockRequest = {
        params: { id: 'user-on-company-123' },
        body: { role: 'INVALID_ROLE' },
        user: { id: 'admin-user-123' },
      };

      await expect(
        userOnCompanyController.updateUserRole(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError.badRequest('Invalid role', 'INVALID_ROLE'));
    });

    it('should handle relation not found error', async () => {
      mockRequest = {
        params: { id: 'non-existent-relation' },
        body: { role: CompanyRole.VIEWER },
        user: { id: 'admin-user-123' },
      };

      jest
        .spyOn(updateUserRoleUseCase, 'execute')
        .mockRejectedValue(
          AppError.notFound('User-Company relationship not found', 'RELATION_NOT_FOUND'),
        );

      await expect(
        userOnCompanyController.updateUserRole(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('removeUserFromCompany', () => {
    it('should remove user from company successfully', async () => {
      mockRequest = {
        params: {
          companyId: 'company-123',
          userId: 'user-456',
        },
        user: { id: 'admin-user-123' },
      };

      jest.spyOn(removeUserFromCompanyUseCase, 'execute').mockResolvedValue(undefined);

      await userOnCompanyController.removeUserFromCompany(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(removeUserFromCompanyUseCase.execute).toHaveBeenCalledWith({
        companyId: 'company-123',
        userId: 'user-456',
      });
      expect(mockResponse.status).toHaveBeenCalledWith(204);
      expect(mockResponse.send).toHaveBeenCalled();
    });

    it('should handle relation not found error', async () => {
      mockRequest = {
        params: {
          companyId: 'company-123',
          userId: 'non-existent-user',
        },
        user: { id: 'admin-user-123' },
      };

      jest
        .spyOn(removeUserFromCompanyUseCase, 'execute')
        .mockRejectedValue(
          AppError.notFound('User-Company relationship not found', 'RELATION_NOT_FOUND'),
        );

      await expect(
        userOnCompanyController.removeUserFromCompany(
          mockRequest as Request,
          mockResponse as Response,
        ),
      ).rejects.toThrow(AppError);
    });
  });
});

describe('ensureCompanyRole Middleware Authorization', () => {
  describe('addUserToCompany authorization', () => {
    it('should allow ADMIN to add users to company', async () => {
      const adminUserOnCompany = new UserOnCompany(
        'uoc-admin',
        'company-123',
        'admin-user-789',
        null,
        CompanyRole.ADMIN,
      );

      expect(adminUserOnCompany.canManageUsers()).toBe(true);
      expect(adminUserOnCompany.isAdmin()).toBe(true);
    });

    it('should allow EDITOR to add users to company', async () => {
      const editorUserOnCompany = new UserOnCompany(
        'uoc-editor',
        'company-123',
        'editor-user-789',
        null,
        CompanyRole.EDITOR,
      );

      expect(editorUserOnCompany.canManageUsers()).toBe(true);
      expect(editorUserOnCompany.isEditor()).toBe(true);
    });

    it('should NOT allow VIEWER to add users to company', async () => {
      const viewerUserOnCompany = new UserOnCompany(
        'uoc-viewer',
        'company-123',
        'viewer-user-789',
        null,
        CompanyRole.VIEWER,
      );

      expect(viewerUserOnCompany.canManageUsers()).toBe(false);
      expect(viewerUserOnCompany.isViewer()).toBe(true);
    });
  });

  describe('updateUserRole authorization', () => {
    it('should allow ADMIN to update user roles', async () => {
      const adminUserOnCompany = new UserOnCompany(
        'uoc-admin',
        'company-123',
        'admin-user-789',
        null,
        CompanyRole.ADMIN,
      );

      expect(adminUserOnCompany.canManageUsers()).toBe(true);
      expect(adminUserOnCompany.isAdmin()).toBe(true);
    });

    it('should allow EDITOR to update user roles', async () => {
      const editorUserOnCompany = new UserOnCompany(
        'uoc-editor',
        'company-123',
        'editor-user-789',
        null,
        CompanyRole.EDITOR,
      );

      expect(editorUserOnCompany.canManageUsers()).toBe(true);
      expect(editorUserOnCompany.isEditor()).toBe(true);
    });

    it('should NOT allow VIEWER to update user roles', async () => {
      const viewerUserOnCompany = new UserOnCompany(
        'uoc-viewer',
        'company-123',
        'viewer-user-789',
        null,
        CompanyRole.VIEWER,
      );

      expect(viewerUserOnCompany.canManageUsers()).toBe(false);
      expect(viewerUserOnCompany.isViewer()).toBe(true);
    });
  });

  describe('removeUserFromCompany authorization', () => {
    it('should allow ADMIN to remove users from company', async () => {
      const adminUserOnCompany = new UserOnCompany(
        'uoc-admin',
        'company-123',
        'admin-user-789',
        null,
        CompanyRole.ADMIN,
      );

      expect(adminUserOnCompany.canManageUsers()).toBe(true);
      expect(adminUserOnCompany.isAdmin()).toBe(true);
    });

    it('should allow EDITOR to remove users from company', async () => {
      const editorUserOnCompany = new UserOnCompany(
        'uoc-editor',
        'company-123',
        'editor-user-789',
        null,
        CompanyRole.EDITOR,
      );

      expect(editorUserOnCompany.canManageUsers()).toBe(true);
      expect(editorUserOnCompany.isEditor()).toBe(true);
    });

    it('should NOT allow VIEWER to remove users from company', async () => {
      const viewerUserOnCompany = new UserOnCompany(
        'uoc-viewer',
        'company-123',
        'viewer-user-789',
        null,
        CompanyRole.VIEWER,
      );

      expect(viewerUserOnCompany.canManageUsers()).toBe(false);
      expect(viewerUserOnCompany.isViewer()).toBe(true);
    });
  });

  describe('permission matrix', () => {
    it('should verify complete permission matrix for all roles', () => {
      const admin = new UserOnCompany('1', 'c1', 'u1', null, CompanyRole.ADMIN);
      const editor = new UserOnCompany('2', 'c1', 'u2', null, CompanyRole.EDITOR);
      const viewer = new UserOnCompany('3', 'c1', 'u3', null, CompanyRole.VIEWER);

      // ADMIN permissions
      expect(admin.canManageUsers()).toBe(true);
      expect(admin.canEdit()).toBe(true);
      expect(admin.canDelete()).toBe(true);
      expect(admin.canView()).toBe(true);

      // EDITOR permissions
      expect(editor.canManageUsers()).toBe(true);
      expect(editor.canEdit()).toBe(true);
      expect(editor.canDelete()).toBe(false);
      expect(editor.canView()).toBe(true);

      // VIEWER permissions
      expect(viewer.canManageUsers()).toBe(false);
      expect(viewer.canEdit()).toBe(false);
      expect(viewer.canDelete()).toBe(false);
      expect(viewer.canView()).toBe(true);
    });
  });
});

describe('UserOnCompany Entity', () => {
  describe('role checks', () => {
    it('should correctly identify ADMIN role', () => {
      const adminUserOnCompany = new UserOnCompany(
        'uoc-1',
        'company-1',
        'user-1',
        null,
        CompanyRole.ADMIN,
      );

      expect(adminUserOnCompany.isAdmin()).toBe(true);
      expect(adminUserOnCompany.isEditor()).toBe(false);
      expect(adminUserOnCompany.isViewer()).toBe(false);
    });

    it('should correctly identify EDITOR role', () => {
      const editorUserOnCompany = new UserOnCompany(
        'uoc-1',
        'company-1',
        'user-1',
        null,
        CompanyRole.EDITOR,
      );

      expect(editorUserOnCompany.isAdmin()).toBe(false);
      expect(editorUserOnCompany.isEditor()).toBe(true);
      expect(editorUserOnCompany.isViewer()).toBe(false);
    });

    it('should correctly identify VIEWER role', () => {
      const viewerUserOnCompany = new UserOnCompany(
        'uoc-1',
        'company-1',
        'user-1',
        null,
        CompanyRole.VIEWER,
      );

      expect(viewerUserOnCompany.isAdmin()).toBe(false);
      expect(viewerUserOnCompany.isEditor()).toBe(false);
      expect(viewerUserOnCompany.isViewer()).toBe(true);
    });
  });

  describe('permission checks', () => {
    it('should allow ADMIN to edit, delete, view and manage users', () => {
      const adminUserOnCompany = new UserOnCompany(
        'uoc-1',
        'company-1',
        'user-1',
        null,
        CompanyRole.ADMIN,
      );

      expect(adminUserOnCompany.canEdit()).toBe(true);
      expect(adminUserOnCompany.canDelete()).toBe(true);
      expect(adminUserOnCompany.canView()).toBe(true);
      expect(adminUserOnCompany.canManageUsers()).toBe(true);
    });

    it('should allow EDITOR to edit, view and manage users but not delete', () => {
      const editorUserOnCompany = new UserOnCompany(
        'uoc-1',
        'company-1',
        'user-1',
        null,
        CompanyRole.EDITOR,
      );

      expect(editorUserOnCompany.canEdit()).toBe(true);
      expect(editorUserOnCompany.canDelete()).toBe(false);
      expect(editorUserOnCompany.canView()).toBe(true);
      expect(editorUserOnCompany.canManageUsers()).toBe(true);
    });

    it('should allow VIEWER only to view', () => {
      const viewerUserOnCompany = new UserOnCompany(
        'uoc-1',
        'company-1',
        'user-1',
        null,
        CompanyRole.VIEWER,
      );

      expect(viewerUserOnCompany.canEdit()).toBe(false);
      expect(viewerUserOnCompany.canDelete()).toBe(false);
      expect(viewerUserOnCompany.canView()).toBe(true);
      expect(viewerUserOnCompany.canManageUsers()).toBe(false);
    });
  });

  describe('static methods', () => {
    it('should create a new UserOnCompany with generated ID', () => {
      const userOnCompany = UserOnCompany.create({
        companyId: 'company-1',
        userId: 'user-1',
        type: null,
        role: CompanyRole.ADMIN,
      });

      expect(userOnCompany.id).toBeDefined();
      expect(userOnCompany.companyId).toBe('company-1');
      expect(userOnCompany.userId).toBe('user-1');
      expect(userOnCompany.role).toBe(CompanyRole.ADMIN);
    });

    it('should create UserOnCompany from Prisma object', () => {
      const prismaUserOnCompany = {
        id: 'uoc-123',
        companyId: 'company-456',
        userId: 'user-789',
        type: null,
        role: CompanyRole.EDITOR,
      };

      const userOnCompany = UserOnCompany.fromPrisma(prismaUserOnCompany);

      expect(userOnCompany.id).toBe('uoc-123');
      expect(userOnCompany.companyId).toBe('company-456');
      expect(userOnCompany.userId).toBe('user-789');
      expect(userOnCompany.role).toBe(CompanyRole.EDITOR);
    });
  });
});

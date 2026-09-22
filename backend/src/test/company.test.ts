import { CompanyController } from '../infrastructure/http/controllers/CompanyController';
import { Request, Response } from 'express';
import { CreateCompanyUseCase } from '../application/use-cases/company/CreateCompanyUseCase';
import { ICompanyRepository } from '../domain/repositories/ICompanyRepository';
import { IUserOnCompanyRepository } from '../domain/repositories/IUserOnCompanyRepository';
import { Company } from '../domain/entities/Company';
import { UserOnCompany } from '../domain/entities/UserOnCompany';
import { AppError } from '../domain/errors/AppError';
import { CompanyRole } from '@prisma/client';
import { IRuleOnCompanyRepository } from '../domain/repositories/IRuleOnCompanyRepository';
import { IWorkspaceMemberRepository } from '../domain/repositories/IWorkspaceMemberRepository';
import { IWorkspaceRepository } from '../domain/repositories/IWorkspaceRepository';
import { ICompanyOnWorkspaceRepository } from '../domain/repositories/ICompanyOnWorkspaceRepository';

jest.mock('../application/use-cases/company/CreateCompanyUseCase');

describe('CompanyController', () => {
  let companyController: CompanyController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let createCompanyUseCase: jest.Mocked<CreateCompanyUseCase>;
  let mockCompanyRepository: jest.Mocked<ICompanyRepository>;
  let mockUserOnCompanyRepository: jest.Mocked<IUserOnCompanyRepository>;
  let mockRuleOnCompanyRepository: jest.Mocked<IRuleOnCompanyRepository>;
  let mockWorkspaceRepository: jest.Mocked<IWorkspaceRepository>;
  let mockWorkspaceMemberRepository: jest.Mocked<IWorkspaceMemberRepository>;
  let mockCompanyOnWorkspaceRepository: jest.Mocked<ICompanyOnWorkspaceRepository>;

  beforeEach(() => {
    mockCompanyRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findManyByUserId: jest.fn(),
      findByVatNumber: jest.fn(),
      findByFiscalCode: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteWithAllData: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      getCourierEmail: jest.fn(),
      setCourierEmail: jest.fn(),
    } as jest.Mocked<ICompanyRepository>;

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
    } as unknown as jest.Mocked<IUserOnCompanyRepository>;

    mockRuleOnCompanyRepository = {
      findDistinctWorkspaceKindsByCompanyId: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<IRuleOnCompanyRepository>;

    mockWorkspaceRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<IWorkspaceRepository>;

    mockWorkspaceMemberRepository = {
      findByWorkspaceAndUser: jest.fn(),
    } as unknown as jest.Mocked<IWorkspaceMemberRepository>;

    mockCompanyOnWorkspaceRepository = {
      createMany: jest.fn(),
      findCompanyIdsByWorkspaceId: jest.fn(),
      findAssignmentsWithCompanies: jest.fn(),
      replaceAssignments: jest.fn(),
      assignCompany: jest.fn(),
    } as unknown as jest.Mocked<ICompanyOnWorkspaceRepository>;

    createCompanyUseCase = jest.mocked(
      new CreateCompanyUseCase(
        mockCompanyRepository,
        mockUserOnCompanyRepository,
        mockWorkspaceRepository,
        mockWorkspaceMemberRepository,
        mockCompanyOnWorkspaceRepository,
      ),
    );

    companyController = new CompanyController(
      mockCompanyRepository,
      mockUserOnCompanyRepository,
      createCompanyUseCase,
      mockRuleOnCompanyRepository,
      mockWorkspaceRepository,
      mockWorkspaceMemberRepository,
      mockCompanyOnWorkspaceRepository,
    );

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn(),
    } as unknown as Partial<Response>;
  });

  describe('create', () => {
    it('should create a new company successfully', async () => {
      const inputCompanyData = {
        name: 'Test Company',
        vatNumber: '12345678901',
        fiscalCode: 'TSTCMP12A34B567C',
        nation: 'Italy',
        city: 'Rome',
        address: 'Via Test 123',
        cap: '00100',
        email: 'test@company.com',
        phoneNumber: '+393331234567',
        website: 'https://www.testcompany.com',
        logoUrl: 'https://www.testcompany.com/logo.png',
      };

      mockRequest = {
        body: inputCompanyData,
        user: { id: 'user-123' },
      };

      const expectedCompany = new Company(
        'company-123',
        inputCompanyData.name,
        inputCompanyData.vatNumber,
        null,
        inputCompanyData.fiscalCode,
        inputCompanyData.nation,
        inputCompanyData.city,
        inputCompanyData.address,
        inputCompanyData.cap,
        inputCompanyData.email,
        inputCompanyData.phoneNumber,
        inputCompanyData.website,
        inputCompanyData.logoUrl,
        new Date(),
        new Date(),
      );

      const expectedUserOnCompany = new UserOnCompany(
        'user-on-company-123',
        'company-123',
        'user-123',
        null,
        CompanyRole.ADMIN,
      );

      const expectedResult = {
        company: expectedCompany,
        userOnCompany: expectedUserOnCompany,
      };

      jest.spyOn(createCompanyUseCase, 'execute').mockResolvedValue(expectedResult);

      await companyController.create(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          company: expectedCompany,
          message: 'Company created successfully. You have been added as admin.',
        },
      });
    });

    it('should throw error when required fields are missing', async () => {
      const inputIncompleteData = {
        name: 'Test Company',
      };

      mockRequest = {
        body: inputIncompleteData,
        user: { id: 'user-123' },
      };

      await expect(
        companyController.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should throw error when user is not authenticated', async () => {
      const inputCompanyData = {
        name: 'Test Company',
        vatNumber: '12345678901',
        fiscalCode: 'TSTCMP12A34B567C',
        nation: 'Italy',
        city: 'Rome',
        address: 'Via Test 123',
        cap: '00100',
        email: 'test@company.com',
        phoneNumber: '+393331234567',
        website: 'https://www.testcompany.com',
        logoUrl: 'https://www.testcompany.com/logo.png',
      };

      mockRequest = {
        body: inputCompanyData,
        user: undefined,
      };

      await expect(
        companyController.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should handle company already exists error', async () => {
      const inputCompanyData = {
        name: 'Test Company',
        vatNumber: '12345678901',
        fiscalCode: 'TSTCMP12A34B567C',
        nation: 'Italy',
        city: 'Rome',
        address: 'Via Test 123',
        cap: '00100',
        email: 'test@company.com',
        phoneNumber: '+393331234567',
        website: 'https://www.testcompany.com',
        logoUrl: 'https://www.testcompany.com/logo.png',
      };

      mockRequest = {
        body: inputCompanyData,
        user: { id: 'user-123' },
      };

      jest
        .spyOn(createCompanyUseCase, 'execute')
        .mockRejectedValue(
          AppError.conflict('Company with this VAT number already exists', 'COMPANY_EXISTS'),
        );

      await expect(
        companyController.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('findById', () => {
    it('should find a company by id successfully', async () => {
      const inputCompanyId = 'company-123';

      mockRequest = {
        params: { id: inputCompanyId },
      };

      const expectedCompany = new Company(
        inputCompanyId,
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
        'https://www.testcompany.com',
        'https://www.testcompany.com/logo.png',
        new Date(),
        new Date(),
      );

      jest.spyOn(mockCompanyRepository, 'findById').mockResolvedValue(expectedCompany);

      await companyController.findById(mockRequest as Request, mockResponse as Response);

      expect(mockCompanyRepository.findById).toHaveBeenCalledWith(inputCompanyId);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { company: expectedCompany },
      });
    });

    it('should throw error when company not found', async () => {
      const inputCompanyId = 'non-existent-id';

      mockRequest = {
        params: { id: inputCompanyId },
      };

      jest.spyOn(mockCompanyRepository, 'findById').mockResolvedValue(null);

      await expect(
        companyController.findById(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('update', () => {
    it('should update a company successfully', async () => {
      const inputCompanyId = 'company-123';
      const inputUpdateData = {
        name: 'Updated Company Name',
        email: 'updated@company.com',
      };

      mockRequest = {
        params: { id: inputCompanyId },
        body: inputUpdateData,
      };

      const existingCompany = new Company(
        inputCompanyId,
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
        'https://www.testcompany.com',
        'https://www.testcompany.com/logo.png',
        new Date(),
        new Date(),
      );

      const expectedUpdatedCompany = new Company(
        inputCompanyId,
        inputUpdateData.name,
        '12345678901',
        null,
        'TSTCMP12A34B567C',
        'Italy',
        'Rome',
        'Via Test 123',
        '00100',
        inputUpdateData.email,
        '+393331234567',
        'https://www.testcompany.com',
        'https://www.testcompany.com/logo.png',
        new Date(),
        new Date(),
      );

      jest.spyOn(mockCompanyRepository, 'findById').mockResolvedValue(existingCompany);
      jest.spyOn(mockCompanyRepository, 'update').mockResolvedValue(expectedUpdatedCompany);

      await companyController.update(mockRequest as Request, mockResponse as Response);

      expect(mockCompanyRepository.findById).toHaveBeenCalledWith(inputCompanyId);
      expect(mockCompanyRepository.update).toHaveBeenCalledWith(inputCompanyId, inputUpdateData);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { company: expectedUpdatedCompany },
      });
    });

    it('should throw error when company to update not found', async () => {
      const inputCompanyId = 'non-existent-id';
      const inputUpdateData = {
        name: 'Updated Company Name',
      };

      mockRequest = {
        params: { id: inputCompanyId },
        body: inputUpdateData,
      };

      jest.spyOn(mockCompanyRepository, 'findById').mockResolvedValue(null);

      await expect(
        companyController.update(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should throw error when updating to existing VAT number', async () => {
      const inputCompanyId = 'company-123';
      const inputUpdateData = {
        vatNumber: '98765432109',
      };

      mockRequest = {
        params: { id: inputCompanyId },
        body: inputUpdateData,
      };

      const existingCompany = new Company(
        inputCompanyId,
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
        'https://www.testcompany.com',
        'https://www.testcompany.com/logo.png',
        new Date(),
        new Date(),
      );

      const anotherCompany = new Company(
        'company-456',
        'Another Company',
        '98765432109',
        null,
        'ANOTHER12A34B567C',
        'Italy',
        'Milan',
        'Via Another 456',
        '20100',
        'another@company.com',
        '+393339876543',
        'https://www.anothercompany.com',
        'https://www.anothercompany.com/logo.png',
        new Date(),
        new Date(),
      );

      jest.spyOn(mockCompanyRepository, 'findById').mockResolvedValue(existingCompany);
      jest.spyOn(mockCompanyRepository, 'findByVatNumber').mockResolvedValue(anotherCompany);

      await expect(
        companyController.update(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should throw error when updating to existing fiscal code', async () => {
      const inputCompanyId = 'company-123';
      const inputUpdateData = {
        fiscalCode: 'ANOTHER12A34B567C',
      };

      mockRequest = {
        params: { id: inputCompanyId },
        body: inputUpdateData,
      };

      const existingCompany = new Company(
        inputCompanyId,
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
        'https://www.testcompany.com',
        'https://www.testcompany.com/logo.png',
        new Date(),
        new Date(),
      );

      const anotherCompany = new Company(
        'company-456',
        'Another Company',
        '98765432109',
        null,
        'ANOTHER12A34B567C',
        'Italy',
        'Milan',
        'Via Another 456',
        '20100',
        'another@company.com',
        '+393339876543',
        'https://www.anothercompany.com',
        'https://www.anothercompany.com/logo.png',
        new Date(),
        new Date(),
      );

      jest.spyOn(mockCompanyRepository, 'findById').mockResolvedValue(existingCompany);
      jest.spyOn(mockCompanyRepository, 'findByFiscalCode').mockResolvedValue(anotherCompany);

      await expect(
        companyController.update(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should allow updating VAT number to the same value', async () => {
      const inputCompanyId = 'company-123';
      const inputUpdateData = {
        vatNumber: '12345678901',
        name: 'Updated Name',
      };

      mockRequest = {
        params: { id: inputCompanyId },
        body: inputUpdateData,
      };

      const existingCompany = new Company(
        inputCompanyId,
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
        'https://www.testcompany.com',
        'https://www.testcompany.com/logo.png',
        new Date(),
        new Date(),
      );

      const expectedUpdatedCompany = new Company(
        inputCompanyId,
        inputUpdateData.name,
        '12345678901',
        null,
        'TSTCMP12A34B567C',
        'Italy',
        'Rome',
        'Via Test 123',
        '00100',
        'test@company.com',
        '+393331234567',
        'https://www.testcompany.com',
        'https://www.testcompany.com/logo.png',
        new Date(),
        new Date(),
      );

      jest.spyOn(mockCompanyRepository, 'findById').mockResolvedValue(existingCompany);
      jest.spyOn(mockCompanyRepository, 'update').mockResolvedValue(expectedUpdatedCompany);

      await companyController.update(mockRequest as Request, mockResponse as Response);

      expect(mockCompanyRepository.findByVatNumber).not.toHaveBeenCalled();
      expect(mockCompanyRepository.update).toHaveBeenCalledWith(inputCompanyId, inputUpdateData);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { company: expectedUpdatedCompany },
      });
    });
  });

  describe('delete', () => {
    it('should delete a company successfully', async () => {
      const inputCompanyId = 'company-123';

      mockRequest = {
        params: { id: inputCompanyId },
      };

      const existingCompany = new Company(
        inputCompanyId,
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
        'https://www.testcompany.com',
        'https://www.testcompany.com/logo.png',
        new Date(),
        new Date(),
      );

      jest.spyOn(mockCompanyRepository, 'findById').mockResolvedValue(existingCompany);
      jest.spyOn(mockCompanyRepository, 'delete').mockResolvedValue();

      await companyController.delete(mockRequest as Request, mockResponse as Response);

      expect(mockCompanyRepository.findById).toHaveBeenCalledWith(inputCompanyId);
      expect(mockCompanyRepository.delete).toHaveBeenCalledWith(inputCompanyId);
      expect(mockResponse.status).toHaveBeenCalledWith(204);
      expect(mockResponse.send).toHaveBeenCalled();
    });

    it('should throw error when company to delete not found', async () => {
      const inputCompanyId = 'non-existent-id';

      mockRequest = {
        params: { id: inputCompanyId },
      };

      jest.spyOn(mockCompanyRepository, 'findById').mockResolvedValue(null);

      await expect(
        companyController.delete(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });
});

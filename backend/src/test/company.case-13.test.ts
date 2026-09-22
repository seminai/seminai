import { CompanyController } from '../infrastructure/http/controllers/CompanyController';
import { Request, Response } from 'express';
import { CreateCompanyUseCase } from '../application/use-cases/company/CreateCompanyUseCase';
import { ICompanyRepository } from '../domain/repositories/ICompanyRepository';
import { IUserOnCompanyRepository } from '../domain/repositories/IUserOnCompanyRepository';
import { AppError } from '../domain/errors/AppError';
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

  describe('delete', () => {

    it('should throw error when company to delete not found', async () => {
      const inputCompanyId = 'non-existent-id';

      mockRequest = {
        params: { id: inputCompanyId },
      };

      jest.spyOn(mockCompanyRepository, 'findById').mockResolvedValue(null);

      await expect(
        companyController.delete(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });});});

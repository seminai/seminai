import { Request, Response } from 'express';
import { RuleController } from '../infrastructure/http/controllers/RuleController';
import { CreateRuleUseCase } from '../application/use-cases/rule/CreateRuleUseCase';
import { GetRuleUseCase } from '../application/use-cases/rule/GetRuleUseCase';
import { ListRulesUseCase } from '../application/use-cases/rule/ListRulesUseCase';
import { UpdateRuleUseCase } from '../application/use-cases/rule/UpdateRuleUseCase';
import { DeleteRuleUseCase } from '../application/use-cases/rule/DeleteRuleUseCase';
import { AssignRuleToCompanyUseCase } from '../application/use-cases/rule/AssignRuleToCompanyUseCase';
import { UnassignRuleFromCompanyUseCase } from '../application/use-cases/rule/UnassignRuleFromCompanyUseCase';
import { ListCompanyRulesUseCase } from '../application/use-cases/rule/ListCompanyRulesUseCase';
import { ListRuleCompaniesUseCase } from '../application/use-cases/rule/ListRuleCompaniesUseCase';
import { RetryRuleVectorizationUseCase } from '../application/use-cases/rule/RetryRuleVectorizationUseCase';
import { GetRuleChunksUseCase } from '../application/use-cases/rule/GetRuleChunksUseCase';
import { RuleOnCompany } from '../domain/entities/RuleOnCompany';
describe('RuleController', () => {
  let ruleController: RuleController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockCreateRuleUseCase: jest.Mocked<CreateRuleUseCase>;
  let mockGetRuleUseCase: jest.Mocked<GetRuleUseCase>;
  let mockListRulesUseCase: jest.Mocked<ListRulesUseCase>;
  let mockUpdateRuleUseCase: jest.Mocked<UpdateRuleUseCase>;
  let mockDeleteRuleUseCase: jest.Mocked<DeleteRuleUseCase>;
  let mockAssignRuleToCompanyUseCase: jest.Mocked<AssignRuleToCompanyUseCase>;
  let mockUnassignRuleFromCompanyUseCase: jest.Mocked<UnassignRuleFromCompanyUseCase>;
  let mockListCompanyRulesUseCase: jest.Mocked<ListCompanyRulesUseCase>;
  let mockListRuleCompaniesUseCase: jest.Mocked<ListRuleCompaniesUseCase>;

  beforeEach(() => {
    mockCreateRuleUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateRuleUseCase>;

    mockGetRuleUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetRuleUseCase>;

    mockListRulesUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListRulesUseCase>;

    mockUpdateRuleUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateRuleUseCase>;

    mockDeleteRuleUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<DeleteRuleUseCase>;

    mockAssignRuleToCompanyUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<AssignRuleToCompanyUseCase>;

    mockUnassignRuleFromCompanyUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UnassignRuleFromCompanyUseCase>;

    mockListCompanyRulesUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListCompanyRulesUseCase>;

    mockListRuleCompaniesUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListRuleCompaniesUseCase>;

    ruleController = new RuleController(
      mockCreateRuleUseCase,
      mockGetRuleUseCase,
      mockListRulesUseCase,
      mockUpdateRuleUseCase,
      mockDeleteRuleUseCase,
      mockAssignRuleToCompanyUseCase,
      mockUnassignRuleFromCompanyUseCase,
      mockListCompanyRulesUseCase,
      mockListRuleCompaniesUseCase,
      { execute: jest.fn() } as unknown as RetryRuleVectorizationUseCase,
      { execute: jest.fn() } as unknown as GetRuleChunksUseCase,
    );

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn(),
    } as unknown as Partial<Response>;
  });

  describe('assignToCompany', () => {
    it('should assign rule to company successfully', async () => {
      mockRequest = {
        params: { id: 'rule-123' },
        body: { companyId: 'company-456', priority: 1 },
        user: { id: 'user-123' },
      };

      const expectedAssignment = new RuleOnCompany(
        'assignment-123',
        'rule-123',
        'company-456',
        true,
        1,
        null,
        null,
        new Date(),
        'user-123',
      );

      mockAssignRuleToCompanyUseCase.execute.mockResolvedValue(expectedAssignment);

      await ruleController.assignToCompany(mockRequest as Request, mockResponse as Response);

      expect(mockAssignRuleToCompanyUseCase.execute).toHaveBeenCalledWith({
        data: {
          ruleId: 'rule-123',
          companyId: 'company-456',
          priority: 1,
          overrides: undefined,
          notes: undefined,
          assignedById: 'user-123',
        },
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { assignment: expectedAssignment },
      });
    });});});

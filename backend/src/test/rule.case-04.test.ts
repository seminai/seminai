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
import { AppError } from '../domain/errors/AppError';
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

  describe('create', () => {

    it('should throw error when content is missing', async () => {
      mockRequest = {
        params: { workspaceId: 'workspace-123' },
        body: { name: 'Test Rule', category: 'DISCIPLINARE' },
        user: { id: 'user-123' },
      };

      await expect(
        ruleController.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });});});

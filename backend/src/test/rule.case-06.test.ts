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
import { RuleCategory, RuleStatus } from '@prisma/client';
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

  describe('list', () => {
    it('should list rules for workspace', async () => {
      mockRequest = {
        params: { workspaceId: 'workspace-123' },
        query: {},
        user: { id: 'user-123' },
      };

      const expectedRules = [
        {
          id: 'rule-1',
          workspaceId: 'workspace-123',
          name: 'Rule 1',
          slug: 'rule-1',
          description: null,
          category: RuleCategory.DISCIPLINARE,
          status: RuleStatus.ACTIVE,
          content: {},
          sourceUrl: null,
          sourceDocument: null,
          region: 'Emilia-Romagna',
          validFrom: null,
          validUntil: null,
          version: '1.0',
          isPublic: false,
          isTemplate: false,
          createdById: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date(),
          pdfFileUrl: null,
          pdfFileName: null,
          isVectorized: false,
          vectorizedAt: null,
          vectorizationError: null,
          companiesCount: 0,
          cropsCount: 0,
          companies: [],
        },
        {
          id: 'rule-2',
          workspaceId: 'workspace-123',
          name: 'Rule 2',
          slug: 'rule-2',
          description: null,
          category: RuleCategory.STANDARD,
          status: RuleStatus.DRAFT,
          content: {},
          sourceUrl: null,
          sourceDocument: null,
          region: null,
          validFrom: null,
          validUntil: null,
          version: '1.0',
          isPublic: true,
          isTemplate: false,
          createdById: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date(),
          pdfFileUrl: null,
          pdfFileName: null,
          isVectorized: false,
          vectorizedAt: null,
          vectorizationError: null,
          companiesCount: 0,
          cropsCount: 0,
          companies: [],
        },
      ];

      mockListRulesUseCase.execute.mockResolvedValue(expectedRules);

      await ruleController.list(mockRequest as Request, mockResponse as Response);

      expect(mockListRulesUseCase.execute).toHaveBeenCalledWith({
        workspaceId: 'workspace-123',
        userId: 'user-123',
        filters: {
          category: undefined,
          status: undefined,
          region: undefined,
          search: undefined,
        },
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { rules: expectedRules },
      });
    });});});

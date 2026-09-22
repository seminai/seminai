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
import { Rule } from '../domain/entities/Rule';
import { RuleOnCompany } from '../domain/entities/RuleOnCompany';
import { AppError } from '../domain/errors/AppError';
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

  describe('create', () => {
    it('should create a new rule successfully', async () => {
      const inputRuleData = {
        name: 'Disciplinare Emilia Romagna',
        category: 'DISCIPLINARE',
        content: { maxDose: 100, unit: 'kg/ha' },
        region: 'Emilia-Romagna',
      };

      mockRequest = {
        params: { workspaceId: 'workspace-123' },
        body: inputRuleData,
        user: { id: 'user-123' },
      };

      const expectedRule = new Rule(
        'rule-123',
        'workspace-123',
        inputRuleData.name,
        'disciplinare-emilia-romagna',
        null,
        RuleCategory.DISCIPLINARE,
        RuleStatus.DRAFT,
        inputRuleData.content,
        null,
        null,
        inputRuleData.region,
        null,
        null,
        '1.0',
        false,
        false,
        'user-123',
        new Date(),
        new Date(),
      );

      mockCreateRuleUseCase.execute.mockResolvedValue(expectedRule);

      await ruleController.create(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { rule: expectedRule },
      });
    });

    it('should throw error when name is missing', async () => {
      mockRequest = {
        params: { workspaceId: 'workspace-123' },
        body: { category: 'DISCIPLINARE', content: {} },
        user: { id: 'user-123' },
      };

      await expect(
        ruleController.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should throw error when category is missing', async () => {
      mockRequest = {
        params: { workspaceId: 'workspace-123' },
        body: { name: 'Test Rule', content: {} },
        user: { id: 'user-123' },
      };

      await expect(
        ruleController.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should throw error when content is missing', async () => {
      mockRequest = {
        params: { workspaceId: 'workspace-123' },
        body: { name: 'Test Rule', category: 'DISCIPLINARE' },
        user: { id: 'user-123' },
      };

      await expect(
        ruleController.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should throw error when user is not authenticated', async () => {
      mockRequest = {
        params: { workspaceId: 'workspace-123' },
        body: { name: 'Test', category: 'DISCIPLINARE', content: {} },
        user: undefined,
      };

      await expect(
        ruleController.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
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
    });

    it('should filter rules by category', async () => {
      mockRequest = {
        params: { workspaceId: 'workspace-123' },
        query: { category: 'DISCIPLINARE' },
        user: { id: 'user-123' },
      };

      mockListRulesUseCase.execute.mockResolvedValue([]);

      await ruleController.list(mockRequest as Request, mockResponse as Response);

      expect(mockListRulesUseCase.execute).toHaveBeenCalledWith({
        workspaceId: 'workspace-123',
        userId: 'user-123',
        filters: {
          category: 'DISCIPLINARE',
          status: undefined,
          region: undefined,
          search: undefined,
        },
      });
    });
  });

  describe('findById', () => {
    it('should find rule by id', async () => {
      mockRequest = {
        params: { id: 'rule-123' },
        user: { id: 'user-123' },
      };

      const expectedRule = {
        id: 'rule-123',
        workspaceId: 'workspace-123',
        name: 'Test Rule',
        slug: 'test-rule',
        description: null,
        category: RuleCategory.DISCIPLINARE,
        status: RuleStatus.ACTIVE,
        content: { maxDose: 100 },
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
        companiesCount: 5,
        cropsCount: 3,
        companies: [],
      };

      mockGetRuleUseCase.execute.mockResolvedValue(expectedRule);

      await ruleController.findById(mockRequest as Request, mockResponse as Response);

      expect(mockGetRuleUseCase.execute).toHaveBeenCalledWith({
        ruleId: 'rule-123',
        userId: 'user-123',
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { rule: expectedRule },
      });
    });
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
    });

    it('should throw error when companyId is missing', async () => {
      mockRequest = {
        params: { id: 'rule-123' },
        body: { priority: 1 },
        user: { id: 'user-123' },
      };

      await expect(
        ruleController.assignToCompany(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('unassignFromCompany', () => {
    it('should unassign rule from company', async () => {
      mockRequest = {
        params: { id: 'rule-123', companyId: 'company-456' },
        user: { id: 'user-123' },
      };

      mockUnassignRuleFromCompanyUseCase.execute.mockResolvedValue();

      await ruleController.unassignFromCompany(mockRequest as Request, mockResponse as Response);

      expect(mockUnassignRuleFromCompanyUseCase.execute).toHaveBeenCalledWith({
        ruleId: 'rule-123',
        companyId: 'company-456',
        userId: 'user-123',
      });
      expect(mockResponse.status).toHaveBeenCalledWith(204);
    });
  });

  describe('delete', () => {
    it('should delete rule successfully', async () => {
      mockRequest = {
        params: { id: 'rule-123' },
        user: { id: 'user-123' },
      };

      mockDeleteRuleUseCase.execute.mockResolvedValue();

      await ruleController.delete(mockRequest as Request, mockResponse as Response);

      expect(mockDeleteRuleUseCase.execute).toHaveBeenCalledWith({
        ruleId: 'rule-123',
        userId: 'user-123',
      });
      expect(mockResponse.status).toHaveBeenCalledWith(204);
    });
  });

  describe('listCompanyRules', () => {
    it('should list rules for company', async () => {
      mockRequest = {
        params: { companyId: 'company-123' },
        query: { onlyActive: 'true' },
        user: { id: 'user-123' },
      };

      const expectedRules = [
        {
          rule: new Rule(
            'rule-1',
            'workspace-123',
            'Rule 1',
            'rule-1',
            null,
            RuleCategory.DISCIPLINARE,
            RuleStatus.ACTIVE,
            {},
            null,
            null,
            null,
            null,
            null,
            '1.0',
            false,
            false,
            'user-123',
            new Date(),
            new Date(),
          ),
          isActive: true,
          priority: 0,
          notes: null,
          assignedAt: new Date(),
          appliesToDosage: true,
          appliesToCompliance: false,
          warnings: ['missing PDF', 'PDF not vectorized'],
          notApplicableReason: 'missing PDF; PDF not vectorized',
        },
      ];

      mockListCompanyRulesUseCase.execute.mockResolvedValue(expectedRules);

      await ruleController.listCompanyRules(mockRequest as Request, mockResponse as Response);

      expect(mockListCompanyRulesUseCase.execute).toHaveBeenCalledWith({
        companyId: 'company-123',
        userId: 'user-123',
        onlyActive: true,
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { rules: expectedRules },
      });
    });
  });
});

describe('Rule Entity', () => {
  describe('generateSlug', () => {
    it('should generate slug from name', () => {
      const actualSlug = Rule.generateSlug('Disciplinare Emilia-Romagna 2024');
      expect(actualSlug).toBe('disciplinare-emilia-romagna-2024');
    });

    it('should handle accented characters', () => {
      const actualSlug = Rule.generateSlug('Metodologia Città Agricole');
      expect(actualSlug).toBe('metodologia-citta-agricole');
    });
  });

  describe('isActive', () => {
    it('should return true when status is ACTIVE', () => {
      const rule = new Rule(
        'id',
        'workspace-id',
        'name',
        'slug',
        null,
        RuleCategory.DISCIPLINARE,
        RuleStatus.ACTIVE,
        {},
        null,
        null,
        null,
        null,
        null,
        '1.0',
        false,
        false,
        'user-id',
        new Date(),
        new Date(),
      );

      expect(rule.isActive()).toBe(true);
    });

    it('should return false when status is DRAFT', () => {
      const rule = new Rule(
        'id',
        'workspace-id',
        'name',
        'slug',
        null,
        RuleCategory.DISCIPLINARE,
        RuleStatus.DRAFT,
        {},
        null,
        null,
        null,
        null,
        null,
        '1.0',
        false,
        false,
        'user-id',
        new Date(),
        new Date(),
      );

      expect(rule.isActive()).toBe(false);
    });
  });

  describe('isCurrentlyValid', () => {
    it('should return true when no date constraints', () => {
      const rule = new Rule(
        'id',
        'workspace-id',
        'name',
        'slug',
        null,
        RuleCategory.DISCIPLINARE,
        RuleStatus.ACTIVE,
        {},
        null,
        null,
        null,
        null,
        null,
        '1.0',
        false,
        false,
        'user-id',
        new Date(),
        new Date(),
      );

      expect(rule.isCurrentlyValid()).toBe(true);
    });

    it('should return false when validFrom is in the future', () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24);
      const rule = new Rule(
        'id',
        'workspace-id',
        'name',
        'slug',
        null,
        RuleCategory.DISCIPLINARE,
        RuleStatus.ACTIVE,
        {},
        null,
        null,
        null,
        futureDate,
        null,
        '1.0',
        false,
        false,
        'user-id',
        new Date(),
        new Date(),
      );

      expect(rule.isCurrentlyValid()).toBe(false);
    });

    it('should return false when validUntil is in the past', () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24);
      const rule = new Rule(
        'id',
        'workspace-id',
        'name',
        'slug',
        null,
        RuleCategory.DISCIPLINARE,
        RuleStatus.ACTIVE,
        {},
        null,
        null,
        null,
        null,
        pastDate,
        '1.0',
        false,
        false,
        'user-id',
        new Date(),
        new Date(),
      );

      expect(rule.isCurrentlyValid()).toBe(false);
    });
  });

  describe('isDisciplinare', () => {
    it('should return true for DISCIPLINARE category', () => {
      const rule = new Rule(
        'id',
        'workspace-id',
        'name',
        'slug',
        null,
        RuleCategory.DISCIPLINARE,
        RuleStatus.ACTIVE,
        {},
        null,
        null,
        null,
        null,
        null,
        '1.0',
        false,
        false,
        'user-id',
        new Date(),
        new Date(),
      );

      expect(rule.isDisciplinare()).toBe(true);
    });

    it('should return false for STANDARD category', () => {
      const rule = new Rule(
        'id',
        'workspace-id',
        'name',
        'slug',
        null,
        RuleCategory.STANDARD,
        RuleStatus.ACTIVE,
        {},
        null,
        null,
        null,
        null,
        null,
        '1.0',
        false,
        false,
        'user-id',
        new Date(),
        new Date(),
      );

      expect(rule.isDisciplinare()).toBe(false);
    });
  });
});

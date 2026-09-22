import { Request, Response } from 'express';
import { CreateRuleUseCase } from '../../../application/use-cases/rule/CreateRuleUseCase';
import { GetRuleUseCase } from '../../../application/use-cases/rule/GetRuleUseCase';
import { ListRulesUseCase } from '../../../application/use-cases/rule/ListRulesUseCase';
import { UpdateRuleUseCase } from '../../../application/use-cases/rule/UpdateRuleUseCase';
import { DeleteRuleUseCase } from '../../../application/use-cases/rule/DeleteRuleUseCase';
import { AssignRuleToCompanyUseCase } from '../../../application/use-cases/rule/AssignRuleToCompanyUseCase';
import { UnassignRuleFromCompanyUseCase } from '../../../application/use-cases/rule/UnassignRuleFromCompanyUseCase';
import { ListCompanyRulesUseCase } from '../../../application/use-cases/rule/ListCompanyRulesUseCase';
import { ListRuleCompaniesUseCase } from '../../../application/use-cases/rule/ListRuleCompaniesUseCase';
import { RetryRuleVectorizationUseCase } from '../../../application/use-cases/rule/RetryRuleVectorizationUseCase';
import { GetRuleChunksUseCase } from '../../../application/use-cases/rule/GetRuleChunksUseCase';
import { AppError } from '../../../domain/errors/AppError';
import { RuleCategory, RuleStatus } from '@prisma/client';
import { requireAuthenticatedUserId } from './controller-auth';
import { parseOptionalBoolean, parseRuleContent, uploadRulePdf } from './rule-request.helpers';

export class RuleController {
  constructor(
    private createRuleUseCase: CreateRuleUseCase,
    private getRuleUseCase: GetRuleUseCase,
    private listRulesUseCase: ListRulesUseCase,
    private updateRuleUseCase: UpdateRuleUseCase,
    private deleteRuleUseCase: DeleteRuleUseCase,
    private assignRuleToCompanyUseCase: AssignRuleToCompanyUseCase,
    private unassignRuleFromCompanyUseCase: UnassignRuleFromCompanyUseCase,
    private listCompanyRulesUseCase: ListCompanyRulesUseCase,
    private listRuleCompaniesUseCase: ListRuleCompaniesUseCase,
    private retryRuleVectorizationUseCase: RetryRuleVectorizationUseCase,
    private getRuleChunksUseCase: GetRuleChunksUseCase,
  ) {}

  async create(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);

    const { workspaceId } = request.params;
    const {
      name,
      slug,
      description,
      category,
      sourceUrl,
      sourceDocument,
      region,
      validFrom,
      validUntil,
      version,
      isPublic,
      isTemplate,
    } = request.body;

    const content = parseRuleContent(request.body.content);

    if (!name) {
      throw AppError.badRequest('Name is required', 'MISSING_NAME');
    }
    if (!category) {
      throw AppError.badRequest('Category is required', 'MISSING_CATEGORY');
    }
    if (!content) {
      throw AppError.badRequest('Content is required', 'MISSING_CONTENT');
    }

    const pdfData = await uploadRulePdf(request);

    const rule = await this.createRuleUseCase.execute({
      data: {
        workspaceId,
        name,
        slug,
        description,
        category: category as RuleCategory,
        content,
        sourceUrl,
        sourceDocument,
        region,
        validFrom: validFrom ? new Date(validFrom) : undefined,
        validUntil: validUntil ? new Date(validUntil) : undefined,
        version,
        isPublic: parseOptionalBoolean(isPublic),
        isTemplate: parseOptionalBoolean(isTemplate),
        createdById: userId,
        pdfFileUrl: pdfData?.url ?? null,
        pdfFileName: pdfData?.fileName ?? null,
        pdfFileHash: pdfData?.hash ?? null,
      },
    });

    return response.status(201).json({
      status: 'success',
      data: { rule },
    });
  }

  async findById(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);

    const { id } = request.params;

    const rule = await this.getRuleUseCase.execute({
      ruleId: id,
      userId,
    });

    return response.json({
      status: 'success',
      data: { rule },
    });
  }

  async list(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);

    const { workspaceId } = request.params;
    const { category, status, region, search } = request.query;

    const rules = await this.listRulesUseCase.execute({
      workspaceId,
      userId,
      filters: {
        category: category as RuleCategory | undefined,
        status: status as RuleStatus | undefined,
        region: region as string | undefined,
        search: search as string | undefined,
      },
    });

    return response.json({
      status: 'success',
      data: { rules },
    });
  }

  async update(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);

    const { id } = request.params;
    const updateData = { ...request.body };

    if (typeof updateData.content === 'string') {
      updateData.content = parseRuleContent(updateData.content);
    }

    if (updateData.validFrom) {
      updateData.validFrom = new Date(updateData.validFrom);
    }
    if (updateData.validUntil) {
      updateData.validUntil = new Date(updateData.validUntil);
    }

    // Parse boolean fields from multipart form
    if (updateData.isPublic !== undefined) {
      updateData.isPublic = parseOptionalBoolean(updateData.isPublic);
    }
    if (updateData.isTemplate !== undefined) {
      updateData.isTemplate = parseOptionalBoolean(updateData.isTemplate);
    }

    // Handle optional PDF upload
    const pdfData = await uploadRulePdf(request);
    if (pdfData) {
      updateData.pdfFileUrl = pdfData.url;
      updateData.pdfFileName = pdfData.fileName;
      updateData.pdfFileHash = pdfData.hash;
      updateData.isVectorized = false;
      updateData.vectorizedAt = null;
      updateData.vectorizationError = null;
    }

    const rule = await this.updateRuleUseCase.execute({
      ruleId: id,
      userId,
      data: updateData,
    });

    return response.json({
      status: 'success',
      data: { rule },
    });
  }

  async delete(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);

    const { id } = request.params;

    await this.deleteRuleUseCase.execute({
      ruleId: id,
      userId,
    });

    return response.status(204).send();
  }

  async assignToCompany(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);

    const { id } = request.params;
    const { companyId, workspaceId, priority, overrides, notes } = request.body;

    if (!companyId) {
      throw AppError.badRequest('Company ID is required', 'MISSING_COMPANY_ID');
    }

    const assignment = await this.assignRuleToCompanyUseCase.execute({
      data: {
        ruleId: id,
        companyId,
        workspaceId,
        priority,
        overrides,
        notes,
        assignedById: userId,
      },
    });

    return response.status(201).json({
      status: 'success',
      data: { assignment },
    });
  }

  async unassignFromCompany(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);

    const { id, companyId } = request.params;

    await this.unassignRuleFromCompanyUseCase.execute({
      ruleId: id,
      companyId,
      userId,
    });

    return response.status(204).send();
  }

  async listCompanyRules(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);

    const { companyId } = request.params;
    const { onlyActive } = request.query;

    const rules = await this.listCompanyRulesUseCase.execute({
      companyId,
      userId,
      onlyActive: onlyActive === 'true',
    });

    return response.json({
      status: 'success',
      data: { rules },
    });
  }

  async listRuleCompanies(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);

    const { id } = request.params;

    const companies = await this.listRuleCompaniesUseCase.execute({
      ruleId: id,
      userId,
    });

    return response.json({
      status: 'success',
      data: { companies },
    });
  }

  async retryVectorization(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const ruleId = request.params.id ?? request.params.ruleId;
    if (!ruleId) {
      throw AppError.badRequest('Rule ID is required', 'MISSING_RULE_ID');
    }
    const { rule, jobId } = await this.retryRuleVectorizationUseCase.execute({
      ruleId,
      userId,
    });
    return response.status(202).json({ status: 'accepted', data: { rule, jobId } });
  }

  async getChunks(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const ruleId = request.params.id ?? request.params.ruleId;
    if (!ruleId) {
      throw AppError.badRequest('Rule ID is required', 'MISSING_RULE_ID');
    }
    const limitRaw =
      typeof request.query.limit === 'string' ? Number(request.query.limit) : undefined;
    const limit = typeof limitRaw === 'number' && Number.isFinite(limitRaw) ? limitRaw : undefined;
    const result = await this.getRuleChunksUseCase.execute({
      ruleId,
      userId,
      limit,
    });
    return response.status(200).json({ status: 'success', data: result });
  }
}

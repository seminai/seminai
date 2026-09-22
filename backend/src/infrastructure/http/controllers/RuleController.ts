import { Request, Response } from 'express';
import { createHash } from 'node:crypto';
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
import { RuleCategory } from '@prisma/client';
import { FileService } from '../../services/FileService';
import { MulterFile } from '../../services/Multer';

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
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

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

    // Parse content: supports both JSON string (multipart) and object (json)
    const content = this.parseContentField(request.body.content);

    if (!name) {
      throw AppError.badRequest('Name is required', 'MISSING_NAME');
    }
    if (!category) {
      throw AppError.badRequest('Category is required', 'MISSING_CATEGORY');
    }
    if (!content) {
      throw AppError.badRequest('Content is required', 'MISSING_CONTENT');
    }

    // Handle optional PDF upload
    const pdfData = await this.handlePdfUpload(request);

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
        isPublic: this.parseBooleanField(isPublic),
        isTemplate: this.parseBooleanField(isTemplate),
        createdById: request.user.id,
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
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id } = request.params;

    const rule = await this.getRuleUseCase.execute({
      ruleId: id,
      userId: request.user.id,
    });

    return response.json({
      status: 'success',
      data: { rule },
    });
  }

  async list(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { workspaceId } = request.params;
    const { category, status, region, search } = request.query;

    const rules = await this.listRulesUseCase.execute({
      workspaceId,
      userId: request.user.id,
      filters: {
        category: category as RuleCategory | undefined,
        status: status as any,
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
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id } = request.params;
    const updateData = { ...request.body };

    // Parse content if it's a JSON string (multipart form)
    if (typeof updateData.content === 'string') {
      updateData.content = this.parseContentField(updateData.content);
    }

    // Parse dates if provided
    if (updateData.validFrom) {
      updateData.validFrom = new Date(updateData.validFrom);
    }
    if (updateData.validUntil) {
      updateData.validUntil = new Date(updateData.validUntil);
    }

    // Parse boolean fields from multipart form
    if (updateData.isPublic !== undefined) {
      updateData.isPublic = this.parseBooleanField(updateData.isPublic);
    }
    if (updateData.isTemplate !== undefined) {
      updateData.isTemplate = this.parseBooleanField(updateData.isTemplate);
    }

    // Handle optional PDF upload
    const pdfData = await this.handlePdfUpload(request);
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
      userId: request.user.id,
      data: updateData,
    });

    return response.json({
      status: 'success',
      data: { rule },
    });
  }

  async delete(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id } = request.params;

    await this.deleteRuleUseCase.execute({
      ruleId: id,
      userId: request.user.id,
    });

    return response.status(204).send();
  }

  async assignToCompany(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

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
        assignedById: request.user.id,
      },
    });

    return response.status(201).json({
      status: 'success',
      data: { assignment },
    });
  }

  async unassignFromCompany(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id, companyId } = request.params;

    await this.unassignRuleFromCompanyUseCase.execute({
      ruleId: id,
      companyId,
      userId: request.user.id,
    });

    return response.status(204).send();
  }

  async listCompanyRules(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { companyId } = request.params;
    const { onlyActive } = request.query;

    const rules = await this.listCompanyRulesUseCase.execute({
      companyId,
      userId: request.user.id,
      onlyActive: onlyActive === 'true',
    });

    return response.json({
      status: 'success',
      data: { rules },
    });
  }

  async listRuleCompanies(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id } = request.params;

    const companies = await this.listRuleCompaniesUseCase.execute({
      ruleId: id,
      userId: request.user.id,
    });

    return response.json({
      status: 'success',
      data: { companies },
    });
  }

  /**
   * Handles optional PDF file upload from multipart form request.
   * Uploads the file to GCS and returns URL, fileName, and SHA256 hash.
   */
  private async handlePdfUpload(
    request: Request,
  ): Promise<{ url: string; fileName: string; hash: string } | null> {
    const file = (request as Request & { file?: MulterFile }).file;
    if (!file) return null;
    if (file.mimetype !== 'application/pdf') {
      throw AppError.badRequest(
        'Only PDF files are allowed for rule documents',
        'INVALID_FILE_TYPE',
      );
    }
    const maxSizeBytes = 50 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw AppError.badRequest('PDF file exceeds maximum size of 50MB', 'FILE_TOO_LARGE');
    }
    const userId = request.user!.id;
    const fileService = new FileService(userId);
    const pdfUrl = await fileService.uploadFile(file, userId, 'rules/pdfs', 'rule_pdf');
    const hash = createHash('sha256').update(new Uint8Array(file.buffer)).digest('hex');
    return {
      url: pdfUrl,
      fileName: file.originalname,
      hash,
    };
  }

  /**
   * Parses a content field that may be a JSON string (from multipart form) or already an object.
   */
  private parseContentField(content: unknown): unknown {
    if (!content) return null;
    if (typeof content === 'object') return content;
    if (typeof content === 'string') {
      try {
        return JSON.parse(content);
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Parses a boolean field that may be a string (from multipart form) or already a boolean.
   */
  private parseBooleanField(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  }

  async retryVectorization(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const ruleId = request.params.id ?? request.params.ruleId;
    if (!ruleId) {
      throw AppError.badRequest('Rule ID is required', 'MISSING_RULE_ID');
    }
    const { rule, jobId } = await this.retryRuleVectorizationUseCase.execute({
      ruleId,
      userId: request.user.id,
    });
    return response.status(202).json({ status: 'accepted', data: { rule, jobId } });
  }

  async getChunks(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const ruleId = request.params.id ?? request.params.ruleId;
    if (!ruleId) {
      throw AppError.badRequest('Rule ID is required', 'MISSING_RULE_ID');
    }
    const limitRaw =
      typeof request.query.limit === 'string' ? Number(request.query.limit) : undefined;
    const limit = typeof limitRaw === 'number' && Number.isFinite(limitRaw) ? limitRaw : undefined;
    const result = await this.getRuleChunksUseCase.execute({
      ruleId,
      userId: request.user.id,
      limit,
    });
    return response.status(200).json({ status: 'success', data: result });
  }
}

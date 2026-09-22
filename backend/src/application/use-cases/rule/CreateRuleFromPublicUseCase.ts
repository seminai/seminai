import { RuleStatus } from '@prisma/client';
import { Rule } from '../../../domain/entities/Rule';
import { AppError } from '../../../domain/errors/AppError';
import { IRuleRepository } from '../../../domain/repositories/IRuleRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { FileService } from '../../../infrastructure/services/FileService';
import { getRulePdfVectorizationQueue } from '../../../infrastructure/queue/RulePdfVectorizationQueue';
import { WorkspacePlanLimitsPolicy } from '../../services/workspace/WorkspacePlanLimitsPolicy';

interface CreateRuleFromPublicRequest {
  readonly publicRuleId: string;
  readonly workspaceId: string;
  readonly userId: string;
}

interface CopiedPdfData {
  readonly url: string | null;
  readonly fileName: string | null;
  readonly hash: string | null;
}

export class CreateRuleFromPublicUseCase {
  constructor(
    private readonly ruleRepository: IRuleRepository,
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: CreateRuleFromPublicRequest): Promise<Rule> {
    const source = await this.getPublicSourceRule(request.publicRuleId);
    await this.assertCanCreateRule(request.workspaceId, request.userId);
    const pdfData = await this.copyPdfIfPresent(source, request.userId);
    const rule = Rule.create({
      workspaceId: request.workspaceId,
      name: `${source.name} (copy)`,
      slug: await this.generateCopySlug(request.workspaceId, source.slug),
      description: source.description,
      category: source.category,
      status: RuleStatus.DRAFT,
      content: source.content,
      sourceUrl: source.sourceUrl,
      sourceDocument: source.sourceDocument,
      region: source.region,
      validFrom: source.validFrom,
      validUntil: source.validUntil,
      version: source.version,
      isPublic: false,
      isTemplate: false,
      createdById: request.userId,
      pdfFileUrl: pdfData.url,
      pdfFileName: pdfData.fileName,
      pdfFileHash: pdfData.hash,
    });
    const created = await this.ruleRepository.create(rule);
    if (created.pdfFileUrl) await this.enqueueVectorization(created);
    return created;
  }

  private async getPublicSourceRule(ruleId: string): Promise<Rule> {
    const source = await this.ruleRepository.findById(ruleId);
    if (!source) throw AppError.notFound('Rule not found', 'RULE_NOT_FOUND');
    if (!source.isPublic || source.status !== RuleStatus.ACTIVE) {
      throw AppError.forbidden('Rule is not available in marketplace', 'RULE_NOT_PUBLIC');
    }
    return source;
  }

  private async assertCanCreateRule(workspaceId: string, userId: string): Promise<void> {
    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(workspaceId, userId);
    if (!member)
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    if (!member.hasRuleManagementPermission()) {
      throw AppError.forbidden('You do not have permission to manage rules', 'NO_RULE_PERMISSION');
    }
    const workspace = await this.workspaceRepository.findById(workspaceId);
    if (!workspace) throw AppError.notFound('Workspace not found', 'WORKSPACE_NOT_FOUND');
    const ruleCount = await this.workspaceRepository.countRules(workspaceId);
    const limits = WorkspacePlanLimitsPolicy.getLimits(workspace.plan);
    if (ruleCount >= limits.maxRules) {
      throw AppError.badRequest('Workspace has reached maximum rule limit', 'RULE_LIMIT_REACHED');
    }
  }

  private async generateCopySlug(workspaceId: string, sourceSlug: string): Promise<string> {
    const base = `${sourceSlug}-copy`;
    for (let index = 0; index < 100; index += 1) {
      const candidate = index === 0 ? base : `${base}-${index + 1}`;
      const existing = await this.ruleRepository.findBySlug(workspaceId, candidate);
      if (!existing) return candidate;
    }
    throw AppError.conflict('Unable to generate a unique rule slug', 'RULE_SLUG_EXISTS');
  }

  private async copyPdfIfPresent(source: Rule, userId: string): Promise<CopiedPdfData> {
    if (!source.pdfFileUrl) return { url: null, fileName: null, hash: null };
    const fileService = new FileService(userId);
    const sourceFile = await fileService.getFileFromUrl(source.pdfFileUrl);
    const url = await fileService.uploadFile(sourceFile, userId, 'rules/pdfs', 'rule_pdf');
    return { url, fileName: source.pdfFileName, hash: source.pdfFileHash };
  }

  private async enqueueVectorization(rule: Rule): Promise<void> {
    const queue = getRulePdfVectorizationQueue();
    await queue.addJob({
      ruleId: rule.id,
      pdfFileUrl: rule.pdfFileUrl!,
      workspaceId: rule.workspaceId,
      userId: rule.createdById,
      ruleName: rule.name,
      category: rule.category,
      region: rule.region ?? undefined,
    });
  }
}

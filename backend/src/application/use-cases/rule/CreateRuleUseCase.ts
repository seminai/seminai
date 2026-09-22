import { Rule } from '../../../domain/entities/Rule';
import { IRuleRepository } from '../../../domain/repositories/IRuleRepository';
import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { CreateRuleDTO } from '../../../domain/dtos/rule.dto';
import { AppError } from '../../../domain/errors/AppError';
import { RuleStatus } from '@prisma/client';
import { getRulePdfVectorizationQueue } from '../../../infrastructure/queue/RulePdfVectorizationQueue';
import { WorkspacePlanLimitsPolicy } from '../../services/workspace/WorkspacePlanLimitsPolicy';

interface CreateRuleRequest {
  data: CreateRuleDTO;
}

export class CreateRuleUseCase {
  constructor(
    private ruleRepository: IRuleRepository,
    private workspaceRepository: IWorkspaceRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: CreateRuleRequest): Promise<Rule> {
    const { data } = request;
    const { workspaceId, createdById } = data;

    // Check if user has permission to create rules
    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(
      workspaceId,
      createdById,
    );
    if (!member) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }
    if (!member.hasRuleManagementPermission()) {
      throw AppError.forbidden('You do not have permission to manage rules', 'NO_RULE_PERMISSION');
    }

    // Check workspace limits
    const workspace = await this.workspaceRepository.findById(workspaceId);
    if (!workspace) {
      throw AppError.notFound('Workspace not found', 'WORKSPACE_NOT_FOUND');
    }
    const ruleCount = await this.workspaceRepository.countRules(workspaceId);
    const limits = WorkspacePlanLimitsPolicy.getLimits(workspace.plan);
    if (ruleCount >= limits.maxRules) {
      throw AppError.badRequest('Workspace has reached maximum rule limit', 'RULE_LIMIT_REACHED');
    }

    // Generate slug if not provided
    const slug = data.slug || Rule.generateSlug(data.name);

    // Check if slug already exists in workspace
    const existingRule = await this.ruleRepository.findBySlug(workspaceId, slug);
    if (existingRule) {
      throw AppError.conflict(
        'A rule with this slug already exists in the workspace',
        'RULE_SLUG_EXISTS',
      );
    }

    // Create rule
    const rule = Rule.create({
      workspaceId,
      name: data.name,
      slug,
      description: data.description ?? null,
      category: data.category,
      status: RuleStatus.DRAFT,
      content: data.content,
      sourceUrl: data.sourceUrl ?? null,
      sourceDocument: data.sourceDocument ?? null,
      region: data.region ?? null,
      validFrom: data.validFrom ?? null,
      validUntil: data.validUntil ?? null,
      version: data.version ?? '1.0',
      isPublic: data.isPublic ?? false,
      isTemplate: data.isTemplate ?? false,
      createdById,
      pdfFileUrl: data.pdfFileUrl ?? null,
      pdfFileName: data.pdfFileName ?? null,
      pdfFileHash: data.pdfFileHash ?? null,
    });

    const createdRule = await this.ruleRepository.create(rule);

    // Enqueue PDF vectorization if a PDF was uploaded
    if (createdRule.pdfFileUrl) {
      await this.enqueueVectorization(createdRule);
    }

    return createdRule;
  }

  /**
   * Enqueues the PDF vectorization job for a rule with a PDF file.
   */
  private async enqueueVectorization(rule: Rule): Promise<void> {
    try {
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
      console.log(`[CreateRuleUseCase] Vectorization job enqueued for rule ${rule.id}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[CreateRuleUseCase] Failed to enqueue vectorization: ${errorMessage}`);
    }
  }
}

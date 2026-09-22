import { Rule } from '../../../domain/entities/Rule';
import { IRuleRepository } from '../../../domain/repositories/IRuleRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { AppError } from '../../../domain/errors/AppError';
import { getRulePdfVectorizationQueue } from '../../../infrastructure/queue/RulePdfVectorizationQueue';
import { createVectorSearchQdrantService } from '../../../infrastructure/services/tool/vectorSearchQdrant';
import { resolveRulesQdrantCollection } from '../../../infrastructure/services/llm/qdrantNamespace';

interface RetryRuleVectorizationRequest {
  readonly ruleId: string;
  readonly userId: string;
}

interface RetryRuleVectorizationResponse {
  readonly rule: Rule;
  readonly jobId: string;
}

/**
 * Re-enqueues the PDF vectorization job for a rule that previously failed
 * (or that the user wants to re-process). Resets vectorizationError on the rule.
 */
export class RetryRuleVectorizationUseCase {
  constructor(
    private readonly ruleRepository: IRuleRepository,
    private readonly workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: RetryRuleVectorizationRequest): Promise<RetryRuleVectorizationResponse> {
    const rule = await this.ruleRepository.findById(request.ruleId);
    if (!rule) throw AppError.notFound('Rule not found', 'RULE_NOT_FOUND');

    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(
      rule.workspaceId,
      request.userId,
    );
    if (!member) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }
    if (!member.hasRuleManagementPermission()) {
      throw AppError.forbidden('You do not have permission to manage rules', 'NO_RULE_PERMISSION');
    }

    if (!rule.pdfFileUrl) {
      throw AppError.badRequest('Rule has no PDF to vectorize', 'RULE_HAS_NO_PDF');
    }

    await this.deleteExistingRuleVectors(rule);

    const updatedRule = await this.ruleRepository.update(request.ruleId, {
      isVectorized: false,
      vectorizedAt: null,
      vectorizationError: null,
    });

    const queue = getRulePdfVectorizationQueue();
    const jobId = await queue.addJob({
      ruleId: updatedRule.id,
      pdfFileUrl: updatedRule.pdfFileUrl!,
      workspaceId: updatedRule.workspaceId,
      userId: request.userId,
      ruleName: updatedRule.name,
      category: updatedRule.category,
      region: updatedRule.region ?? undefined,
    });

    return { rule: updatedRule, jobId };
  }

  private async deleteExistingRuleVectors(rule: Rule): Promise<void> {
    try {
      const vectorService = createVectorSearchQdrantService(resolveRulesQdrantCollection());
      await vectorService.deleteRulePdfVectors(rule.workspaceId, rule.id);
      console.log(`[RetryRuleVectorizationUseCase] Deleted existing vectors for rule ${rule.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw AppError.internal(
        `Failed to cleanup existing rule vectors: ${message}`,
        'RULE_VECTOR_CLEANUP_FAILED',
      );
    }
  }
}

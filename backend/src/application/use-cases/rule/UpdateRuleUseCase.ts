import { Rule } from '../../../domain/entities/Rule';
import { IRuleRepository } from '../../../domain/repositories/IRuleRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { UpdateRuleDTO } from '../../../domain/dtos/rule.dto';
import { AppError } from '../../../domain/errors/AppError';
import { getRulePdfVectorizationQueue } from '../../../infrastructure/queue/RulePdfVectorizationQueue';
import { createVectorSearchQdrantService } from '../../../infrastructure/services/tool/vectorSearchQdrant';
import { RULES_QDRANT_COLLECTION } from '../../../domain/dtos/rule-rag.types';
import { FileService } from '../../../infrastructure/services/FileService';

interface UpdateRuleRequest {
  ruleId: string;
  userId: string;
  data: UpdateRuleDTO;
}

export class UpdateRuleUseCase {
  constructor(
    private ruleRepository: IRuleRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: UpdateRuleRequest): Promise<Rule> {
    const { ruleId, userId, data } = request;

    const rule = await this.ruleRepository.findById(ruleId);
    if (!rule) {
      throw AppError.notFound('Rule not found', 'RULE_NOT_FOUND');
    }

    // Check user has permission
    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(
      rule.workspaceId,
      userId,
    );
    if (!member) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }
    if (!member.hasRuleManagementPermission()) {
      throw AppError.forbidden('You do not have permission to manage rules', 'NO_RULE_PERMISSION');
    }

    // Check if new slug is unique (if provided)
    if (data.slug && data.slug !== rule.slug) {
      const slugExists = await this.ruleRepository.findBySlug(rule.workspaceId, data.slug);
      if (slugExists) {
        throw AppError.conflict('A rule with this slug already exists', 'RULE_SLUG_EXISTS');
      }
    }

    // Handle PDF change: clean up old vectors and old file if PDF URL changed
    const isPdfChanged = data.pdfFileUrl !== undefined && data.pdfFileUrl !== rule.pdfFileUrl;
    if (isPdfChanged && rule.isVectorized) {
      await this.cleanupOldVectors(rule.workspaceId, ruleId);
    }
    if (isPdfChanged && rule.pdfFileUrl) {
      await this.cleanupOldPdf(rule.pdfFileUrl, userId);
    }

    const updatedRule = await this.ruleRepository.update(ruleId, data);

    // Enqueue vectorization for new PDF
    if (isPdfChanged && updatedRule.pdfFileUrl) {
      await this.enqueueVectorization(updatedRule, userId);
    }

    return updatedRule;
  }

  /**
   * Removes old vectors from Qdrant for a given rule.
   */
  private async cleanupOldVectors(workspaceId: string, ruleId: string): Promise<void> {
    try {
      const vectorService = createVectorSearchQdrantService(RULES_QDRANT_COLLECTION);
      await vectorService.deleteRulePdfVectors(workspaceId, ruleId);
      console.log(`[UpdateRuleUseCase] Deleted old vectors for rule ${ruleId}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw AppError.internal(
        `Failed to cleanup old rule vectors: ${errorMessage}`,
        'RULE_VECTOR_CLEANUP_FAILED',
      );
    }
  }

  /**
   * Deletes the old PDF file from configured storage.
   */
  private async cleanupOldPdf(pdfFileUrl: string, userId: string): Promise<void> {
    try {
      const fileService = new FileService(userId);
      await fileService.deleteFile(pdfFileUrl);
      console.log(`[UpdateRuleUseCase] Deleted old PDF: ${pdfFileUrl}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn(`[UpdateRuleUseCase] Failed to delete old PDF: ${errorMessage}`);
    }
  }

  /**
   * Enqueues vectorization for the updated rule.
   */
  private async enqueueVectorization(rule: Rule, userId: string): Promise<void> {
    try {
      const queue = getRulePdfVectorizationQueue();
      await queue.addJob({
        ruleId: rule.id,
        pdfFileUrl: rule.pdfFileUrl!,
        workspaceId: rule.workspaceId,
        userId,
        ruleName: rule.name,
        category: rule.category,
        region: rule.region ?? undefined,
      });
      console.log(`[UpdateRuleUseCase] Vectorization job enqueued for rule ${rule.id}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[UpdateRuleUseCase] Failed to enqueue vectorization: ${errorMessage}`);
    }
  }
}

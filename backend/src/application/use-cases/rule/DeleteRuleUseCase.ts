import { IRuleRepository } from '../../../domain/repositories/IRuleRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { AppError } from '../../../domain/errors/AppError';
import { createVectorSearchQdrantService } from '../../../infrastructure/services/tool/vectorSearchQdrant';
import { RULES_QDRANT_COLLECTION } from '../../../domain/dtos/rule-rag.types';
import { FileService } from '../../../infrastructure/services/FileService';

interface DeleteRuleRequest {
  ruleId: string;
  userId: string;
}

export class DeleteRuleUseCase {
  constructor(
    private ruleRepository: IRuleRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: DeleteRuleRequest): Promise<void> {
    const { ruleId, userId } = request;

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

    // Cleanup vectorized data from Qdrant before deletion
    if (rule.isVectorized) {
      await this.cleanupVectors(ruleId);
    }

    // Cleanup the stored PDF before deletion
    if (rule.pdfFileUrl) {
      await this.cleanupPdf(rule.pdfFileUrl, userId);
    }

    await this.ruleRepository.delete(ruleId);
  }

  /**
   * Removes vectors from Qdrant for the rule being deleted.
   */
  private async cleanupVectors(ruleId: string): Promise<void> {
    try {
      const vectorService = createVectorSearchQdrantService(RULES_QDRANT_COLLECTION);
      const results = await vectorService.similaritySearch('', 1000, {
        must: [{ key: 'ruleId', match: { value: ruleId } }],
      });
      if (results.length > 0) {
        console.log(
          `[DeleteRuleUseCase] Found ${results.length} vectors to cleanup for rule ${ruleId}`,
        );
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn(`[DeleteRuleUseCase] Failed to cleanup vectors: ${errorMessage}`);
    }
  }

  /**
   * Deletes the PDF file from configured storage.
   */
  private async cleanupPdf(pdfFileUrl: string, userId: string): Promise<void> {
    try {
      const fileService = new FileService(userId);
      await fileService.deleteFile(pdfFileUrl);
      console.log(`[DeleteRuleUseCase] Deleted PDF: ${pdfFileUrl}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn(`[DeleteRuleUseCase] Failed to delete PDF: ${errorMessage}`);
    }
  }
}

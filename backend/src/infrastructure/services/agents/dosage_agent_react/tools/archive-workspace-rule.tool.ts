import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaRuleRepository } from '../../../../repositories/PrismaRuleRepository';
import { PrismaWorkspaceMemberRepository } from '../../../../repositories/PrismaWorkspaceMemberRepository';
import { UpdateRuleUseCase } from '../../../../../application/use-cases/rule/UpdateRuleUseCase';
import { assertWorkspaceAccess } from '../../shared/authorization';

/**
 * Tool: archive_workspace_rule
 * Soft-deletes a rule by moving it to DRAFT status (makes it inactive).
 * Does NOT permanently delete the rule — it remains recoverable.
 * REQUIRES USER APPROVAL.
 */
export function createArchiveWorkspaceRuleTool(userId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'archive_workspace_rule',
    description: `Disattiva una regola del workspace portandola in stato DRAFT (bozza).
⚠️ QUESTO TOOL RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
NON elimina definitivamente la regola — la porta in DRAFT così non è più attiva.
Prima di chiamare questo tool, DEVI mostrare all'utente il nome della regola e confermare che vuole disattivarla.
Per eliminare completamente usa la piattaforma web.
Per riattivare una regola in DRAFT usa update_workspace_rule con status ACTIVE.`,
    schema: z.object({
      ruleId: z.string().describe('ID della regola da disattivare'),
      reason: z
        .string()
        .optional()
        .describe('Motivo della disattivazione (opzionale, per note interne)'),
    }),
    func: async ({ ruleId, reason }) => {
      try {
        const ruleRepo = new PrismaRuleRepository(prisma);
        const memberRepo = new PrismaWorkspaceMemberRepository(prisma);
        const useCase = new UpdateRuleUseCase(ruleRepo, memberRepo);

        // Verify rule exists and get its name before updating
        const existingRule = await ruleRepo.findById(ruleId);
        if (!existingRule) {
          return JSON.stringify({ error: 'Regola non trovata.' });
        }

        // Defense-in-depth: gate the caller on workspace membership before
        // touching the rule. Reuses the findById result above — zero extra query.
        await assertWorkspaceAccess(userId, existingRule.workspaceId);

        if (existingRule.status === 'DRAFT') {
          return JSON.stringify({
            ruleId: existingRule.id,
            name: existingRule.name,
            status: existingRule.status,
            message: `La regola "${existingRule.name}" è già in stato DRAFT.`,
          });
        }

        const updated = await useCase.execute({
          ruleId,
          userId,
          data: { status: 'DRAFT' },
        });

        const reasonMsg = reason ? ` Motivo: ${reason}.` : '';
        return JSON.stringify({
          ruleId: updated.id,
          name: updated.name,
          previousStatus: existingRule.status,
          newStatus: updated.status,
          message: `Regola "${updated.name}" portata in DRAFT (non più attiva).${reasonMsg} Per riabilitarla usa update_workspace_rule con status ACTIVE.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}

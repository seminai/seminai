import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaRuleRepository } from '../../../../repositories/PrismaRuleRepository';
import { PrismaWorkspaceMemberRepository } from '../../../../repositories/PrismaWorkspaceMemberRepository';
import { ListRulesUseCase } from '../../../../../application/use-cases/rule/ListRulesUseCase';
import { RuleListFiltersDTO } from '../../../../../domain/dtos/rule.dto';
import { assertWorkspaceAccess } from '../../shared/authorization';

/**
 * Tool: list_workspace_rules
 * Lists rules in a workspace with optional filters.
 */
export function createListWorkspaceRulesTool(userId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'list_workspace_rules',
    description: `Elenca le regole di un workspace con filtri opzionali.
Usa questo tool dopo list_user_workspaces per vedere le regole disponibili.
Restituisce id, nome, categoria, stato, descrizione, regione e informazioni sulla vettorializzazione PDF.
Le categorie disponibili sono: DISCIPLINARE, STANDARD, BEST_PRACTICE, METHODOLOGY, CUSTOM.
Gli stati disponibili sono: DRAFT (bozza), ACTIVE (attiva), ARCHIVED (archiviata), DEPRECATED.`,
    schema: z.object({
      workspaceId: z.string().describe('ID del workspace di cui elencare le regole'),
      category: z
        .enum(['DISCIPLINARE', 'STANDARD', 'BEST_PRACTICE', 'METHODOLOGY', 'CUSTOM'])
        .optional()
        .describe('Filtra per categoria (opzionale)'),
      status: z
        .enum(['DRAFT', 'ACTIVE', 'ARCHIVED', 'DEPRECATED'])
        .optional()
        .describe('Filtra per stato (opzionale, default: tutte)'),
      search: z.string().optional().describe('Testo di ricerca nel nome/descrizione (opzionale)'),
    }),
    func: async ({ workspaceId, category, status, search }) => {
      try {
        await assertWorkspaceAccess(userId, workspaceId);

        const ruleRepo = new PrismaRuleRepository(prisma);
        const memberRepo = new PrismaWorkspaceMemberRepository(prisma);
        const useCase = new ListRulesUseCase(ruleRepo, memberRepo);

        const rules = await useCase.execute({
          workspaceId,
          userId,
          filters: {
            category: category as RuleListFiltersDTO['category'],
            status: status as RuleListFiltersDTO['status'],
            search,
          },
        });

        if (rules.length === 0) {
          return JSON.stringify({
            rulesFound: 0,
            rules: [],
            message: 'Nessuna regola trovata nel workspace con i filtri specificati.',
          });
        }

        const mapped = rules.map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          description: r.description,
          category: r.category,
          status: r.status,
          region: r.region,
          version: r.version,
          isVectorized: r.isVectorized,
          hasPdf: !!r.pdfFileUrl,
          pdfFileName: r.pdfFileName,
          validFrom: r.validFrom,
          validUntil: r.validUntil,
          companiesCount: r.companiesCount,
        }));

        return JSON.stringify({
          rulesFound: mapped.length,
          rules: mapped,
          message: `Trovate ${mapped.length} regole nel workspace.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}

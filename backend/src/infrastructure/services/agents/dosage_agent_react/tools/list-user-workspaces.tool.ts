import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaWorkspaceRepository } from '../../../../repositories/PrismaWorkspaceRepository';
import { ListUserWorkspacesUseCase } from '../../../../../application/use-cases/workspace/ListUserWorkspacesUseCase';

/**
 * Tool: list_user_workspaces
 * Lists all workspaces the user belongs to.
 * If no workspaces found, informs the user and suggests creating one.
 */
export function createListUserWorkspacesTool(userId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'list_user_workspaces',
    description: `Elenca tutti i workspace a cui appartiene l'utente.
Se l'utente non ha workspace, informa che non ne ha e suggerisce di crearne uno.
Usa questo tool come primo passo quando l'utente vuole vedere, gestire o creare regole del workspace.
Restituisce id, nome, descrizione, piano e numero massimo di regole per ogni workspace.`,
    schema: z.object({}),
    func: async () => {
      try {
        const workspaceRepo = new PrismaWorkspaceRepository(prisma);
        const useCase = new ListUserWorkspacesUseCase(workspaceRepo);
        const workspaces = await useCase.execute(userId);

        if (workspaces.length === 0) {
          return JSON.stringify({
            workspacesFound: 0,
            workspaces: [],
            message:
              'Non hai ancora nessun workspace. Per gestire regole personalizzate devi prima creare un workspace dalla piattaforma web (Impostazioni → Workspace → Crea nuovo workspace).',
            canCreate: true,
          });
        }

        const mapped = workspaces.map((w) => ({
          id: w.id,
          name: w.name,
          slug: w.slug,
          description: w.description,
          plan: w.plan,
          isActive: w.isActive,
          maxRules: w.maxRules,
        }));

        return JSON.stringify({
          workspacesFound: mapped.length,
          workspaces: mapped,
          message: `Trovati ${mapped.length} workspace associati al tuo account.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}

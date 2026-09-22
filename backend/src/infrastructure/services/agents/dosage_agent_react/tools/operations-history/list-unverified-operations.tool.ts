import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { JobWithAssignmentWithoutHistoryDTO } from '../../../../../../domain/dtos/job-assignment.dto';
import type { IJobRepository } from '../../../../../../domain/repositories/IJobRepository';
import { toolError } from '../../../shared/toolResult';
import {
  formatOperationSummariesMarkdown,
  mapUnverifiedJobToSummary,
} from './operation-summary.formatter';

const DEFAULT_GROUP_LIMIT = 8;
const MAX_GROUP_LIMIT = 8;

export function createListUnverifiedOperationsTool(
  userId: string,
  jobRepository: IJobRepository,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'list_unverified_operations',
    description: `Elenca le operazioni non verificate in Archivio, raggruppate per gruppo operazioni. Usa solo quando l'utente chiede esplicitamente operazioni non verificate, da validare, pending o in attesa di verifica.`,
    schema: z.object({
      companyName: z.string().optional().describe('Nome azienda parziale per filtrare i gruppi.'),
      limit: z
        .number()
        .int()
        .positive()
        .max(MAX_GROUP_LIMIT)
        .optional()
        .default(DEFAULT_GROUP_LIMIT),
    }),
    func: async ({ companyName, limit }) => {
      try {
        const cap = Math.min(limit ?? DEFAULT_GROUP_LIMIT, MAX_GROUP_LIMIT);
        const summaries = await jobRepository.findJobGroupsSummaryByUserId(userId);
        const pendingGroups = summaries
          .filter((group) => group.pendingOperations > 0)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const selectedGroups = pendingGroups.slice(0, cap);
        const groupsWithOperations = await Promise.all(
          selectedGroups.map(async (group, index) => {
            const operations = await jobRepository.findUnverifiedJobsByUserIdWithAssignment(
              userId,
              companyName,
              group.jobId,
            );
            return formatGroup(index + 1, group.createdAt, operations);
          }),
        );
        const groups = groupsWithOperations.filter((group) => group.operations.length > 0);
        return JSON.stringify({
          groups,
          totalGroupsWithPending: groups.length,
          totalAvailableGroupsWithPending: pendingGroups.length,
          showing: groups.length,
          hint: 'Mostra ogni gruppo separatamente e indica che queste operazioni sono in attesa di validazione in Archivio. Non mostrare ID tecnici.',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Errore sconosciuto';
        return toolError(message);
      }
    },
  });
}

function formatGroup(
  groupIndex: number,
  createdAt: Date,
  operations: readonly JobWithAssignmentWithoutHistoryDTO[],
) {
  const items = operations.map(mapUnverifiedJobToSummary);
  const firstOperation = operations[0];
  return {
    groupIndex,
    createdAt: createdAt.toISOString().split('T')[0],
    companyName: firstOperation?.company.name ?? '-',
    pendingCount: operations.length,
    operations: items,
    markdownTable: formatOperationSummariesMarkdown(items),
  };
}

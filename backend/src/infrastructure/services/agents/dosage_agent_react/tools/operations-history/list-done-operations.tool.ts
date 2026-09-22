import { DynamicStructuredTool } from '@langchain/core/tools';
import { FieldNoteCategory } from '@prisma/client';
import { z } from 'zod';
import type { IJobRepository } from '../../../../../../domain/repositories/IJobRepository';
import { prisma } from '../../../../../repositories/Prisma';
import { listUserFieldNotes, type FieldNoteListItem } from '../../../../tool/listUserFieldNotes';
import { toolError } from '../../../shared/toolResult';
import {
  formatOperationSummariesMarkdown,
  mapFieldNoteToSummary,
  mapVerifiedJobToSummary,
} from './operation-summary.formatter';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export function createListDoneOperationsTool(
  userId: string,
  jobRepository: IJobRepository,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'list_done_operations',
    description: `Elenca le operazioni gia fatte combinando due fonti: operazioni verificate in Archivio e operazioni registrate nelle note di campo. Usa quando l'utente chiede "quali operazioni ho fatto", "cosa ho trattato", "trattamenti effettuati" o storico operazioni. Non usare per operazioni non verificate: in quel caso usa list_unverified_operations.`,
    schema: z.object({
      companyName: z
        .string()
        .optional()
        .describe('Nome azienda parziale per filtrare i risultati.'),
      startDate: z.string().optional().describe('Data inizio ISO 8601 inclusiva.'),
      endDate: z.string().optional().describe('Data fine ISO 8601 inclusiva.'),
      limit: z.number().int().positive().max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
    }),
    func: async ({ companyName, startDate, endDate, limit }) => {
      try {
        const cap = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
        const range = parseDateRange(startDate, endDate);
        const [archiveResult, fieldNoteResult] = await Promise.all([
          jobRepository.findVerifiedJobsByUserIdWithAssignment(userId, companyName, 0, MAX_LIMIT),
          listUserFieldNotes({
            userId,
            prisma,
            category: FieldNoteCategory.OPERATION,
            startDate: range.startDate,
            endDate: range.endDate,
            limit: MAX_LIMIT,
          }),
        ]);
        const archiveItems = archiveResult.jobs.filter((item) =>
          isWithinDateRange(item.job.dateOfOpeation, range),
        );
        const fieldNoteItems = filterFieldNotesByCompany(fieldNoteResult.items, companyName);
        return JSON.stringify({
          verifiedArchiveOperations: {
            total: archiveItems.length,
            returned: Math.min(archiveItems.length, cap),
            truncated: archiveItems.length > cap,
            items: archiveItems.slice(0, cap).map(mapVerifiedJobToSummary),
            markdownTable: formatOperationSummariesMarkdown(
              archiveItems.slice(0, cap).map(mapVerifiedJobToSummary),
            ),
          },
          fieldNoteOperations: {
            total: fieldNoteItems.length,
            returned: Math.min(fieldNoteItems.length, cap),
            truncated: fieldNoteItems.length > cap,
            items: fieldNoteItems.slice(0, cap).map(mapFieldNoteToSummary),
            markdownTable: formatOperationSummariesMarkdown(
              fieldNoteItems.slice(0, cap).map(mapFieldNoteToSummary),
            ),
          },
          hint: 'Presenta due sezioni distinte: Archivio verificato e Note di campo. Non mostrare ID tecnici.',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Errore sconosciuto';
        return toolError(message);
      }
    },
  });
}

function parseDateRange(
  startDate?: string,
  endDate?: string,
): { readonly startDate?: Date; readonly endDate?: Date } {
  return {
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  };
}

function isWithinDateRange(
  date: Date,
  range: { readonly startDate?: Date; readonly endDate?: Date },
): boolean {
  if (range.startDate && date < range.startDate) return false;
  if (range.endDate && date > range.endDate) return false;
  return true;
}

function filterFieldNotesByCompany(
  items: readonly FieldNoteListItem[],
  companyName?: string,
): FieldNoteListItem[] {
  if (!companyName) return [...items];
  const needle = companyName.toLocaleLowerCase('it-IT');
  return items.filter((item) => item.companyName?.toLocaleLowerCase('it-IT').includes(needle));
}

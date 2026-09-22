/**
 * Tool: list_existing_job_groups
 * Lists existing treatment job groups for the authenticated user.
 * Used when the user wants to add a new treatment plan to an existing job group
 * instead of creating a brand-new one.
 *
 * Returns at most 8 groups, ordered by creation date (newest first).
 * Each entry includes: internal jobId, createdAt, company names, distinct product count.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { toolError } from '../../shared/toolResult';

const MAX_GROUPS = 8;

interface JobGroupEntry {
  readonly jobId: string;
  readonly createdAt: string;
  readonly companies: string[];
  readonly productCount: number;
  readonly totalJobs: number;
}

export function createListExistingJobGroupsTool(userId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'list_existing_job_groups',
    description: `Elenca i gruppi di job di trattamento già esistenti per l'utente corrente.
Restituisce al massimo ${MAX_GROUPS} gruppi, ordinati per data di creazione (più recenti prima).
	Per ogni gruppo mostra all'utente solo numero progressivo, data di creazione, aziende coinvolte, numero prodotti distinti.
	Usalo quando l'utente vuole aggiungere trattamenti a un gruppo già esistente ma non specifica quale.`,
    schema: z.object({
      limit: z
        .number()
        .min(1)
        .max(MAX_GROUPS)
        .optional()
        .default(MAX_GROUPS)
        .describe(`Numero massimo di gruppi da restituire (default ${MAX_GROUPS}).`),
    }),
    func: async ({ limit }) => {
      try {
        const cap = Math.min(limit ?? MAX_GROUPS, MAX_GROUPS);

        const memberships = await prisma.userOnCompany.findMany({
          where: { userId },
          select: { companyId: true },
        });
        const companyIds = memberships.map((m) => m.companyId);
        if (companyIds.length === 0) {
          return JSON.stringify({
            groups: [],
            message: 'Nessuna azienda associata. Impossibile trovare gruppi di job.',
          });
        }

        const jobs = await prisma.job.findMany({
          where: {
            jobId: { not: null },
            productionUnit: {
              productionUnitsOnFields: {
                some: { field: { companyId: { in: companyIds } } },
              },
            },
          },
          select: {
            jobId: true,
            createdAt: true,
            productionUnit: {
              select: {
                productionUnitsOnFields: {
                  select: {
                    field: {
                      select: {
                        company: { select: { id: true, name: true } },
                      },
                    },
                  },
                  take: 1,
                },
              },
            },
            stocks: {
              select: { productId: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        const groupsMap = new Map<
          string,
          {
            jobId: string;
            createdAt: Date;
            companySet: Map<string, string>;
            productIdSet: Set<string>;
            totalJobs: number;
          }
        >();

        for (const job of jobs) {
          if (!job.jobId) continue;

          const company = job.productionUnit?.productionUnitsOnFields[0]?.field?.company;
          const existing = groupsMap.get(job.jobId);

          if (existing) {
            existing.totalJobs += 1;
            if (company) {
              existing.companySet.set(company.id, company.name);
            }
            for (const stock of job.stocks) {
              existing.productIdSet.add(stock.productId);
            }
          } else {
            const companySet = new Map<string, string>();
            if (company) companySet.set(company.id, company.name);

            const productIdSet = new Set<string>();
            for (const stock of job.stocks) {
              productIdSet.add(stock.productId);
            }

            groupsMap.set(job.jobId, {
              jobId: job.jobId,
              createdAt: job.createdAt,
              companySet,
              productIdSet,
              totalJobs: 1,
            });
          }
        }

        const sorted = Array.from(groupsMap.values())
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, cap);

        const groups: JobGroupEntry[] = sorted.map((g) => ({
          jobId: g.jobId,
          createdAt: g.createdAt.toISOString().split('T')[0],
          companies: Array.from(g.companySet.values()),
          productCount: g.productIdSet.size,
          totalJobs: g.totalJobs,
        }));

        if (groups.length === 0) {
          return JSON.stringify({
            groups: [],
            message: 'Nessun gruppo di job trovato per questo utente.',
          });
        }

        const rows = groups
          .map(
            (g, i) =>
              `| ${i + 1} | ${g.createdAt} | ${g.companies.join(', ') || 'N/D'} | ${g.productCount} | ${g.totalJobs} |`,
          )
          .join('\n');

        const markdownTable = `| # | Data creazione | Aziende | N. prodotti | N. job |
	|---|---------------|---------|-------------|--------|
	${rows}`;

        return JSON.stringify({
          groups,
          totalAvailable: groupsMap.size,
          showing: groups.length,
          markdownTable,
          hint: "Chiedi all'utente quale gruppo selezionare per numero, senza mostrare identificativi tecnici. Poi usa internamente il jobId del gruppo scelto come queueJobId.",
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return toolError(msg);
      }
    },
  });
}

import type { JobWithRelations } from './types';
import { prisma } from '../../../repositories/Prisma';
import { normalizeJobWithRelations } from './loaders.part-01-load-jobs-by-group-id';

/**
 * Loads jobs for confirmation with required relations.
 * Uses shared normalizeJobWithRelations for consistent productionCycle fallback.
 */
export async function loadJobsForConfirmation(
  jobGroupId: string,
): Promise<Map<string, JobWithRelations>> {
  const groupJobs = await prisma.job.findMany({
    where: { jobId: jobGroupId },
    include: {
      stocks: {
        include: {
          product: {
            include: {
              warehouse: { select: { companyId: true } },
            },
          },
        },
      },
      productionUnit: {
        select: {
          areaHa: true,
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          cycles: {
            orderBy: [{ seasonYear: 'desc' }, { cycleIndex: 'desc' }],
            take: 1,
            select: {
              cropName: true,
              cropType: true,
              variety: true,
            },
          },
        },
      },
      productionCycle: { select: { cropName: true, cropType: true, variety: true } },
    },
    orderBy: { dateOfOpeation: 'asc' },
  });

  const jobById = new Map<string, JobWithRelations>();
  for (const job of groupJobs) {
    jobById.set(job.id, normalizeJobWithRelations(job));
  }

  return jobById;
}

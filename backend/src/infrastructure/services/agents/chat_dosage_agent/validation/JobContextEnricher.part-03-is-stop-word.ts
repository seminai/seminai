import { prisma } from '../../../../repositories/Prisma';
import { STOP_WORDS } from './JobContextEnricher.part-02-stop-words';

/**
 * Checks if a word is a stop word.
 */
export function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word.toLowerCase());
}

/**
 * Gets additional context from a job including crop name and production unit info.
 *
 * @param jobId - The ID of the job
 * @returns Object with region, cropName, and productionUnitName
 */
export async function getJobContext(
  jobId: string,
): Promise<{ region: string | null; cropName: string | null; productionUnitName: string | null }> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      productionUnit: {
        include: {
          productionUnitsOnFields: {
            include: {
              field: true,
            },
          },
          cycles: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
  });

  if (!job?.productionUnit) {
    return { region: null, cropName: null, productionUnitName: null };
  }

  let region: string | null = null;
  for (const allocation of job.productionUnit.productionUnitsOnFields) {
    if (allocation.field?.region) {
      region = allocation.field.region;
      break;
    }
  }

  // Get cropName from the most recent production cycle
  const cropName = job.productionUnit.cycles?.[0]?.cropName ?? null;

  return {
    region,
    cropName,
    productionUnitName: job.productionUnit.name ?? null,
  };
}

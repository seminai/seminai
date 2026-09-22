import { prisma } from '../../../../repositories/Prisma';

interface ResolveJobCompanyParams {
  readonly jobId: string;
  readonly userId?: string;
}

interface JobCompanyContext {
  readonly companyId: string;
  readonly workspaceIds: ReadonlyArray<string>;
}

/**
 * Resolves the company bound to a job and the user's workspace scope.
 * Relationship path: Job -> ProductionUnit -> ProductionUnitOnField -> Field -> Company.
 */
export async function resolveJobCompanyContext(
  params: ResolveJobCompanyParams,
): Promise<JobCompanyContext | null> {
  const job = await prisma.job.findUnique({
    where: { id: params.jobId },
    select: {
      productionUnit: {
        select: {
          productionUnitsOnFields: {
            select: {
              field: {
                select: {
                  companyId: true,
                },
              },
            },
          },
        },
      },
    },
  });
  const allCompanyIds = (job?.productionUnit?.productionUnitsOnFields ?? [])
    .map((relation) => relation.field?.companyId ?? null)
    .filter((value): value is string => Boolean(value));
  const uniqueCompanyIds = [...new Set(allCompanyIds)];
  if (uniqueCompanyIds.length === 0) {
    return null;
  }
  let companyId: string;
  if (uniqueCompanyIds.length > 1) {
    // Pick the company with the most field allocations (majority)
    const counts = new Map<string, number>();
    for (const id of allCompanyIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    companyId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    console.warn(
      `[resolveJobCompanyContext] Job ${params.jobId} has fields across multiple companies: ${uniqueCompanyIds.join(', ')}. Using majority: ${companyId}`,
    );
  } else {
    companyId = uniqueCompanyIds[0];
  }
  if (!params.userId) {
    return { companyId, workspaceIds: [] };
  }
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: params.userId },
    select: { workspaceId: true },
  });
  const workspaceIds = memberships.map((membership) => membership.workspaceId);
  return { companyId, workspaceIds };
}

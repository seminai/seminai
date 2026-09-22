import { Job } from '../../domain/entities/Job';
import type { PrismaJobRepositoryContext } from './prisma-job-repository.context';

export async function prismaJobRepositoryFindManyByIdsWithCompany(this: PrismaJobRepositoryContext, ids: string[]): Promise<Array<{ job: Job; companyId: string | null }>> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.job.findMany({
      where: { id: { in: ids } },
      include: {
        productionUnit: {
          include: {
            productionUnitsOnFields: {
              include: { field: { select: { companyId: true } } },
              take: 1,
            },
          },
        },
      },
    });
    return rows.map((row) => ({
      job: Job.fromPrisma(row),
      companyId: row.productionUnit?.productionUnitsOnFields[0]?.field?.companyId ?? null,
    }));
  }

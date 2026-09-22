import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositoryDeleteMany(this: PrismaProductionUnitRepositoryContext, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.job.deleteMany({
        where: {
          productionUnitId: { in: ids },
        },
      });
      await tx.productionUnitOnField.deleteMany({
        where: {
          productionUnitId: { in: ids },
        },
      });
      await tx.productionUnit.deleteMany({
        where: {
          id: { in: ids },
        },
      });
    });
  }

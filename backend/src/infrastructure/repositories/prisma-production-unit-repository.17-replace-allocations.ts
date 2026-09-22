import { randomUUID } from 'node:crypto';
import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositoryReplaceAllocations(this: PrismaProductionUnitRepositoryContext, productionUnitId: string, allocations: Array<{ fieldId: string; areaHaOnField: number }>): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.productionUnitOnField.deleteMany({ where: { productionUnitId } });
      if (allocations.length > 0) {
        await tx.productionUnitOnField.createMany({
          data: allocations.map((a) => ({
            id: randomUUID(),
            productionUnitId,
            fieldId: a.fieldId,
            areaHaOnField: a.areaHaOnField,
          })),
        });
      }
    });
  }

import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositorySumAreaByFieldAndOverlappingRange(this: PrismaProductionUnitRepositoryContext, fieldId: string, range: { startDate: Date; endDate: Date }): Promise<number> {
    const overlapping = await this.prisma.productionUnitOnField.findMany({
      where: {
        fieldId,
        productionUnit: {
          AND: [{ startDate: { lte: range.endDate } }, { endDate: { gte: range.startDate } }],
        },
      },
      select: { areaHaOnField: true },
    });
    return overlapping.reduce((sum, r) => sum + r.areaHaOnField, 0);
  }

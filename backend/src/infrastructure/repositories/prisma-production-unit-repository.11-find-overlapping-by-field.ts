import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositoryFindOverlappingByField(this: PrismaProductionUnitRepositoryContext, fieldId: string, range: { startDate: Date; endDate: Date }): Promise<
    Array<{
      productionUnitId: string;
      productionUnitName: string;
      cropName: string | null;
      startDate: Date;
      endDate: Date;
      areaHaOnField: number;
    }>
  > {
    const overlapping = await this.prisma.productionUnitOnField.findMany({
      where: {
        fieldId,
        productionUnit: {
          AND: [{ startDate: { lte: range.endDate } }, { endDate: { gte: range.startDate } }],
        },
      },
      select: {
        areaHaOnField: true,
        productionUnit: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            cycles: {
              orderBy: [{ seasonYear: 'desc' }, { cycleIndex: 'desc' }, { harvestingDate: 'desc' }],
              take: 1,
              select: { cropName: true },
            },
          },
        },
      },
    });
    return overlapping.map((row) => ({
      productionUnitId: row.productionUnit.id,
      productionUnitName: row.productionUnit.name,
      cropName: row.productionUnit.cycles[0]?.cropName ?? null,
      startDate: row.productionUnit.startDate,
      endDate: row.productionUnit.endDate,
      areaHaOnField: row.areaHaOnField,
    }));
  }

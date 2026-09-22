import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositoryGetOverlappingDateWindow(this: PrismaProductionUnitRepositoryContext, fieldId: string, range: { startDate: Date; endDate: Date }): Promise<{ earliestStart: Date | null; latestEnd: Date | null }> {
    const overlaps = await this.prisma.productionUnit.findMany({
      where: {
        productionUnitsOnFields: { some: { fieldId } },
        AND: [{ startDate: { lte: range.endDate } }, { endDate: { gte: range.startDate } }],
      },
      select: { startDate: true, endDate: true },
      orderBy: { startDate: 'asc' },
    });
    if (overlaps.length === 0) return { earliestStart: null, latestEnd: null };
    const earliestStart = overlaps[0].startDate;
    const latestEnd = overlaps.reduce(
      (max, r) => (r.endDate > max ? r.endDate : max),
      overlaps[0].endDate,
    );
    return { earliestStart, latestEnd };
  }

import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositoryGetAllocationsByProductionUnit(this: PrismaProductionUnitRepositoryContext, productionUnitId: string): Promise<Array<{ fieldId: string; areaHaOnField: number }>> {
    const links = await this.prisma.productionUnitOnField.findMany({
      where: { productionUnitId },
      select: { fieldId: true, areaHaOnField: true },
    });
    return links.map((l) => ({ fieldId: l.fieldId, areaHaOnField: l.areaHaOnField }));
  }

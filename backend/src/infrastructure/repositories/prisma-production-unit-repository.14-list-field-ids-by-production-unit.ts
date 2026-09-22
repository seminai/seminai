import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositoryListFieldIdsByProductionUnit(this: PrismaProductionUnitRepositoryContext, productionUnitId: string): Promise<string[]> {
    const links = await this.prisma.productionUnitOnField.findMany({
      where: { productionUnitId },
      select: { fieldId: true },
    });
    return links.map((l) => l.fieldId);
  }

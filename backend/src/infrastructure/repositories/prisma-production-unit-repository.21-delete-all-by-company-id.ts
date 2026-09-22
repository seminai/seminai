import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositoryDeleteAllByCompanyId(this: PrismaProductionUnitRepositoryContext, companyId: string): Promise<number> {
    const pus = await this.prisma.productionUnit.findMany({
      where: {
        productionUnitsOnFields: { some: { field: { companyId } } },
      },
      select: { id: true },
    });
    const ids = pus.map((pu) => pu.id);
    if (ids.length === 0) return 0;
    await this.deleteMany(ids);
    return ids.length;
  }

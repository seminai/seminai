import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositoryListCompanyIdsByProductionUnit(this: PrismaProductionUnitRepositoryContext, productionUnitId: string): Promise<string[]> {
    const links = await this.prisma.productionUnitOnField.findMany({
      where: { productionUnitId },
      select: { field: { select: { companyId: true } } },
    });
    const companyIds = links
      .map((link) => link.field.companyId)
      .filter((companyId): companyId is string => Boolean(companyId));
    return [...new Set(companyIds)];
  }

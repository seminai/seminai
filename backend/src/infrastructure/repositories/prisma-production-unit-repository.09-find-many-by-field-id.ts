import { ProductionUnit } from '../../domain/entities/ProductionUnit';
import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositoryFindManyByFieldId(this: PrismaProductionUnitRepositoryContext, fieldId: string): Promise<ProductionUnit[]> {
    const list = await this.prisma.productionUnit.findMany({
      where: { productionUnitsOnFields: { some: { fieldId } } },
      include: {
        cycles: {
          orderBy: [{ seasonYear: 'desc' }, { cycleIndex: 'desc' }, { harvestingDate: 'desc' }],
          take: 1,
        },
      },
    });
    return list
      .filter((pu) => pu.cycles.length > 0)
      .map((pu) =>
        ProductionUnit.fromPrisma({ productionUnit: pu, productionCycle: pu.cycles[0] }),
      );
  }

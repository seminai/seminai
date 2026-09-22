import { ProductionUnit } from '../../domain/entities/ProductionUnit';
import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositoryFindById(this: PrismaProductionUnitRepositoryContext, id: string): Promise<ProductionUnit | null> {
    const found = await this.prisma.productionUnit.findUnique({
      where: { id },
      include: {
        cycles: {
          orderBy: [{ seasonYear: 'desc' }, { cycleIndex: 'desc' }, { harvestingDate: 'desc' }],
          take: 1,
        },
      },
    });
    if (!found || found.cycles.length === 0) return null;
    const cycle = found.cycles[0];
    return ProductionUnit.fromPrisma({ productionUnit: found, productionCycle: cycle });
  }

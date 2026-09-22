import { ProductionUnit } from '../../domain/entities/ProductionUnit';
import { type ProductionUnitCycleCreateInput } from '../../domain/repositories/IProductionUnitRepository';
import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositoryCreateWithCycles(this: PrismaProductionUnitRepositoryContext, pu: ProductionUnit, allocations: Array<{ fieldId: string; areaHaOnField: number }>, additionalCycles: readonly ProductionUnitCycleCreateInput[]): Promise<ProductionUnit> {
    const created = await this.prisma.productionUnit.create({
      data: {
        id: pu.id,
        name: pu.name,
        startDate: pu.startDate ?? new Date(),
        endDate: pu.endDate ?? new Date(),
        areaHa: pu.areaHa,
        createdAt: pu.createdAt,
        updatedAt: pu.updatedAt,
        productionUnitsOnFields: {
          create: allocations.map((a) => ({ fieldId: a.fieldId, areaHaOnField: a.areaHaOnField })),
        },
      },
    });
    const cycles = await this.createCyclesForUnit(created.id, pu, additionalCycles);
    return ProductionUnit.fromPrisma({ productionUnit: created, productionCycle: cycles[0] });
  }

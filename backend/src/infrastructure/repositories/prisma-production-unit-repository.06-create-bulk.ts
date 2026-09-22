import { ProductionUnit } from '../../domain/entities/ProductionUnit';
import { type ProductionUnitCycleCreateInput } from '../../domain/repositories/IProductionUnitRepository';
import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositoryCreateBulk(this: PrismaProductionUnitRepositoryContext, productionUnits: Array<{
      productionUnit: ProductionUnit;
      allocations: Array<{ fieldId: string; areaHaOnField: number }>;
      additionalCycles?: readonly ProductionUnitCycleCreateInput[];
    }>): Promise<ProductionUnit[]> {
    const created: ProductionUnit[] = [];

    for (const { productionUnit, allocations, additionalCycles } of productionUnits) {
      const puEntity = await this.createWithCycles(
        productionUnit,
        allocations,
        additionalCycles ?? [],
      );
      created.push(puEntity);
    }

    return created;
  }

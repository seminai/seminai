import { ProductionUnit } from '../../domain/entities/ProductionUnit';
import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositoryCreate(this: PrismaProductionUnitRepositoryContext, pu: ProductionUnit, allocations: Array<{ fieldId: string; areaHaOnField: number }>): Promise<ProductionUnit> {
    return this.createWithCycles(pu, allocations, []);
  }

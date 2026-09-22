import { ProductionUnit } from '../../domain/entities/ProductionUnit';
import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositoryCreateMany(this: PrismaProductionUnitRepositoryContext, pus: ProductionUnit[]): Promise<void> {
    if (pus.length === 0) return;
    for (const p of pus) {
      await this.create(p, []);
    }
  }

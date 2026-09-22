import { randomUUID } from 'node:crypto';
import { ProductionUnit } from '../../domain/entities/ProductionUnit';
import { type ProductionUnitCycleCreateInput } from '../../domain/repositories/IProductionUnitRepository';
import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositoryCreateCyclesForUnit(this: PrismaProductionUnitRepositoryContext, productionUnitId: string, pu: ProductionUnit, additionalCycles: readonly ProductionUnitCycleCreateInput[]) {
    const primary = {
      id: pu.cycleId,
      productionUnitId,
      cropName: pu.cropName,
      cropType: pu.cropType,
      variety: pu.variety,
      protocoll: pu.protocoll,
      protectionStructure: pu.protectionStructure,
      floweringDate: pu.floweringDate,
      harvestingDate: pu.harvestingDate,
      occupazione: pu.occupazione,
      destinazioneDiUso: pu.destinazioneDiUso,
      acquaTotalePeridoL: pu.acquaTotalePeridoL,
      seasonYear: pu.seasonYear,
      cycleIndex: pu.cycleIndex,
      createdAt: pu.createdAt,
      updatedAt: pu.updatedAt,
    };
    const extra = additionalCycles
      .filter((cycle) => cycle.cycleIndex !== pu.cycleIndex)
      .map((cycle) => ({
        id: randomUUID(),
        productionUnitId,
        cropName: cycle.cropName,
        cropType: cycle.cropType,
        variety: cycle.variety,
        protocoll: cycle.protocoll,
        protectionStructure: cycle.protectionStructure,
        floweringDate: cycle.floweringDate,
        harvestingDate: cycle.harvestingDate,
        occupazione: cycle.occupazione ?? null,
        destinazioneDiUso: cycle.destinazioneDiUso ?? null,
        acquaTotalePeridoL: cycle.acquaTotalePeridoL,
        seasonYear: cycle.seasonYear,
        cycleIndex: cycle.cycleIndex,
        createdAt: pu.createdAt,
        updatedAt: pu.updatedAt,
      }));
    await this.prisma.productionCycle.createMany({ data: [primary, ...extra] });
    return this.prisma.productionCycle.findMany({
      where: { productionUnitId },
      orderBy: [{ cycleIndex: 'asc' }],
    });
  }

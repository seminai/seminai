import { Prisma } from '@prisma/client';
import { ProductionUnit } from '../../domain/entities/ProductionUnit';
import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositoryUpdateMany(this: PrismaProductionUnitRepositoryContext, updates: Array<{ id: string; data: Partial<ProductionUnit> }>): Promise<number> {
    let count = 0;
    for (const { id, data } of updates) {
      const existing = await this.findById(id);
      if (!existing) {
        throw new Error(`ProductionUnit with id ${id} not found`);
      }
      const prismaUnitData: Prisma.ProductionUnitUpdateInput = {};
      if (typeof data.name !== 'undefined') prismaUnitData.name = data.name;
      if (typeof data.startDate !== 'undefined')
        prismaUnitData.startDate = this.toDate(data.startDate);
      if (typeof data.endDate !== 'undefined') prismaUnitData.endDate = this.toDate(data.endDate);
      if (typeof data.areaHa !== 'undefined') prismaUnitData.areaHa = data.areaHa;

      const prismaCycleData: Prisma.ProductionCycleUpdateInput = {};
      if (typeof data.cropName !== 'undefined') prismaCycleData.cropName = data.cropName as string;
      if (typeof data.cropType !== 'undefined') prismaCycleData.cropType = data.cropType as string;
      if (typeof data.variety !== 'undefined') prismaCycleData.variety = data.variety as string;
      if (typeof data.protocoll !== 'undefined')
        prismaCycleData.protocoll = data.protocoll as string;
      if (typeof data.protectionStructure !== 'undefined')
        prismaCycleData.protectionStructure = data.protectionStructure as string;
      if (typeof data.floweringDate !== 'undefined')
        prismaCycleData.floweringDate = this.toDateNullable(data.floweringDate);
      if (typeof data.harvestingDate !== 'undefined')
        prismaCycleData.harvestingDate = this.toDateNullable(data.harvestingDate);
      if (typeof data.occupazione !== 'undefined')
        prismaCycleData.occupazione = data.occupazione as string | null;
      if (typeof data.destinazioneDiUso !== 'undefined')
        prismaCycleData.destinazioneDiUso = data.destinazioneDiUso as string | null;
      if (typeof data.acquaTotalePeridoL !== 'undefined')
        prismaCycleData.acquaTotalePeridoL = data.acquaTotalePeridoL as number;
      if (typeof data.seasonYear !== 'undefined') prismaCycleData.seasonYear = data.seasonYear;
      if (typeof data.cycleIndex !== 'undefined') prismaCycleData.cycleIndex = data.cycleIndex;

      await this.prisma.$transaction([
        this.prisma.productionUnit.update({ where: { id }, data: prismaUnitData }),
        this.prisma.productionCycle.updateMany({
          where: { productionUnitId: id },
          data: prismaCycleData,
        }),
      ]);
      count++;
    }
    return count;
  }

import { Prisma, PrismaClient } from '@prisma/client';
import { ProductionCycle } from '../../domain/entities/ProductionCycle';
import { IProductionCycleRepository } from '../../domain/repositories/IProductionCycleRepository';

export class PrismaProductionCycleRepository implements IProductionCycleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private toDateNullable(value: string | Date | null | undefined): Date | null | undefined {
    if (typeof value === 'undefined') return undefined;
    if (value === null) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid date format: ${value}`);
      }
      return date;
    }
    return undefined;
  }

  async create(cycle: ProductionCycle): Promise<ProductionCycle> {
    const created = await this.prisma.productionCycle.create({
      data: {
        id: cycle.id,
        productionUnitId: cycle.productionUnitId,
        cropName: cycle.cropName,
        cropType: cycle.cropType,
        variety: cycle.variety,
        protocoll: cycle.protocoll,
        protectionStructure: cycle.protectionStructure,
        floweringDate: cycle.floweringDate,
        harvestingDate: cycle.harvestingDate,
        occupazione: cycle.occupazione,
        destinazioneDiUso: cycle.destinazioneDiUso,
        acquaTotalePeridoL: cycle.acquaTotalePeridoL,
        seasonYear: cycle.seasonYear,
        cycleIndex: cycle.cycleIndex,
        createdAt: cycle.createdAt,
        updatedAt: cycle.updatedAt,
      },
    });
    return ProductionCycle.fromPrisma(created);
  }

  async findById(id: string): Promise<ProductionCycle | null> {
    const found = await this.prisma.productionCycle.findUnique({
      where: { id },
    });
    if (!found) return null;
    return ProductionCycle.fromPrisma(found);
  }

  async findManyByProductionUnitId(productionUnitId: string): Promise<ProductionCycle[]> {
    const cycles = await this.prisma.productionCycle.findMany({
      where: { productionUnitId },
      orderBy: [{ seasonYear: 'asc' }, { cycleIndex: 'asc' }],
    });
    return cycles.map(ProductionCycle.fromPrisma);
  }

  async update(id: string, data: Partial<ProductionCycle>): Promise<ProductionCycle> {
    const updateData: Prisma.ProductionCycleUpdateInput = {};

    if (typeof data.cropName !== 'undefined') updateData.cropName = data.cropName;
    if (typeof data.cropType !== 'undefined') updateData.cropType = data.cropType;
    if (typeof data.variety !== 'undefined') updateData.variety = data.variety;
    if (typeof data.protocoll !== 'undefined') updateData.protocoll = data.protocoll;
    if (typeof data.protectionStructure !== 'undefined')
      updateData.protectionStructure = data.protectionStructure;
    if (typeof data.floweringDate !== 'undefined')
      updateData.floweringDate = this.toDateNullable(data.floweringDate);
    if (typeof data.harvestingDate !== 'undefined')
      updateData.harvestingDate = this.toDateNullable(data.harvestingDate);
    if (typeof data.occupazione !== 'undefined') updateData.occupazione = data.occupazione;
    if (typeof data.destinazioneDiUso !== 'undefined')
      updateData.destinazioneDiUso = data.destinazioneDiUso;
    if (typeof data.acquaTotalePeridoL !== 'undefined')
      updateData.acquaTotalePeridoL = data.acquaTotalePeridoL;
    if (typeof data.seasonYear !== 'undefined') updateData.seasonYear = data.seasonYear;
    if (typeof data.cycleIndex !== 'undefined') updateData.cycleIndex = data.cycleIndex;

    const updated = await this.prisma.productionCycle.update({
      where: { id },
      data: updateData,
    });
    return ProductionCycle.fromPrisma(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.productionCycle.delete({
      where: { id },
    });
  }

  async countByProductionUnitId(productionUnitId: string): Promise<number> {
    return this.prisma.productionCycle.count({
      where: { productionUnitId },
    });
  }

  async getNextCycleIndex(productionUnitId: string, seasonYear: number): Promise<number> {
    const maxCycle = await this.prisma.productionCycle.findFirst({
      where: { productionUnitId, seasonYear },
      orderBy: { cycleIndex: 'desc' },
      select: { cycleIndex: true },
    });
    return (maxCycle?.cycleIndex ?? 0) + 1;
  }
}

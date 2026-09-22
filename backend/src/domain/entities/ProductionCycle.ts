import { randomUUID } from 'node:crypto';

/**
 * ProductionCycle domain entity representing a single production cycle within a ProductionUnit.
 */
export class ProductionCycle {
  constructor(
    public readonly id: string,
    public readonly productionUnitId: string,
    public readonly cropName: string,
    public readonly cropType: string,
    public readonly variety: string,
    public readonly protocoll: string,
    public readonly protectionStructure: string,
    public readonly floweringDate: Date | null,
    public readonly harvestingDate: Date | null,
    public readonly occupazione: string | null,
    public readonly destinazioneDiUso: string | null,
    public readonly acquaTotalePeridoL: number,
    public readonly seasonYear: number,
    public readonly cycleIndex: number,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  /**
   * Factory method to create a new ProductionCycle with generated id and timestamps.
   */
  static create(props: {
    productionUnitId: string;
    cropName: string;
    cropType: string;
    variety: string;
    protocoll: string;
    protectionStructure: string;
    floweringDate: Date | null;
    harvestingDate: Date | null;
    occupazione?: string | null;
    destinazioneDiUso?: string | null;
    acquaTotalePeridoL: number;
    seasonYear?: number;
    cycleIndex?: number;
  }): ProductionCycle {
    const now = new Date();
    const seasonYear =
      props.seasonYear ?? props.floweringDate?.getUTCFullYear() ?? now.getUTCFullYear();
    const cycleIndex = props.cycleIndex ?? 1;
    return new ProductionCycle(
      randomUUID(),
      props.productionUnitId,
      props.cropName,
      props.cropType,
      props.variety,
      props.protocoll,
      props.protectionStructure,
      props.floweringDate,
      props.harvestingDate,
      props.occupazione ?? null,
      props.destinazioneDiUso ?? null,
      props.acquaTotalePeridoL,
      seasonYear,
      cycleIndex,
      now,
      now,
    );
  }

  /**
   * Builds a ProductionCycle domain entity from a Prisma record.
   */
  static fromPrisma(data: {
    id: string;
    productionUnitId: string;
    cropName: string;
    cropType: string;
    variety: string;
    protocoll: string;
    protectionStructure: string;
    floweringDate: Date | null;
    harvestingDate: Date | null;
    occupazione: string | null;
    destinazioneDiUso: string | null;
    acquaTotalePeridoL: number;
    seasonYear: number;
    cycleIndex: number;
    createdAt: Date;
    updatedAt: Date;
  }): ProductionCycle {
    return new ProductionCycle(
      data.id,
      data.productionUnitId,
      data.cropName,
      data.cropType,
      data.variety,
      data.protocoll,
      data.protectionStructure,
      data.floweringDate,
      data.harvestingDate,
      data.occupazione,
      data.destinazioneDiUso,
      data.acquaTotalePeridoL,
      data.seasonYear,
      data.cycleIndex,
      data.createdAt,
      data.updatedAt,
    );
  }

  /**
   * Check if cycle is in the past (harvesting date before today).
   * Returns false if harvestingDate is null.
   */
  isPast(): boolean {
    if (!this.harvestingDate) return false;
    return this.harvestingDate < new Date();
  }

  /**
   * Check if cycle is current (between flowering and harvesting).
   * Returns false if either date is null.
   */
  isCurrent(): boolean {
    if (!this.floweringDate || !this.harvestingDate) return false;
    const now = new Date();
    return this.floweringDate <= now && this.harvestingDate >= now;
  }

  /**
   * Check if cycle is in the future (flowering date after today).
   * Returns false if floweringDate is null.
   */
  isFuture(): boolean {
    if (!this.floweringDate) return false;
    return this.floweringDate > new Date();
  }
}

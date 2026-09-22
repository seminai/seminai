import { randomUUID } from 'node:crypto';

/**
 * ProductionUnit domain entity representing a production unit with its active cycle view.
 */
export class ProductionUnit {
  constructor(
    public readonly id: string,
    public readonly cycleId: string,
    public readonly name: string,
    public readonly cropName: string,
    public readonly cropType: string,
    public readonly variety: string,
    public readonly protocoll: string,
    public readonly areaHa: number,
    public readonly protectionStructure: string,
    public readonly startDate: Date | null,
    public readonly floweringDate: Date | null,
    public readonly harvestingDate: Date | null,
    public readonly endDate: Date | null,
    public readonly occupazione: string | null,
    public readonly destinazioneDiUso: string | null,
    public readonly acquaTotalePeridoL: number,
    public readonly seasonYear: number,
    public readonly cycleIndex: number,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  /**
   * Factory method to create a new ProductionUnit with generated ids and timestamps.
   */
  static create(props: {
    name: string;
    cropName: string;
    cropType: string;
    variety: string;
    protocoll: string;
    areaHa: number;
    protectionStructure: string;
    startDate: Date | null;
    floweringDate: Date | null;
    harvestingDate: Date | null;
    endDate: Date | null;
    occupazione?: string | null;
    destinazioneDiUso?: string | null;
    acquaTotalePeridoL: number;
    seasonYear?: number;
    cycleIndex?: number;
  }): ProductionUnit {
    const productionUnitId = randomUUID();
    const cycleId = randomUUID();
    const seasonYear =
      props.seasonYear ?? (props.startDate?.getUTCFullYear() || new Date().getUTCFullYear());
    const cycleIndex = props.cycleIndex ?? 1;
    const now = new Date();
    return new ProductionUnit(
      productionUnitId,
      cycleId,
      props.name,
      props.cropName,
      props.cropType,
      props.variety,
      props.protocoll,
      props.areaHa,
      props.protectionStructure,
      props.startDate,
      props.floweringDate,
      props.harvestingDate,
      props.endDate,
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
   * Builds a ProductionUnit domain entity from aggregated Prisma records.
   */
  static fromPrisma(data: {
    productionUnit: {
      id: string;
      name: string;
      areaHa: number;
      startDate: Date;
      endDate: Date;
      createdAt: Date;
      updatedAt: Date;
    };
    productionCycle: {
      id: string;
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
    };
  }): ProductionUnit {
    const { productionUnit, productionCycle } = data;
    return new ProductionUnit(
      productionUnit.id,
      productionCycle.id,
      productionUnit.name,
      productionCycle.cropName,
      productionCycle.cropType,
      productionCycle.variety,
      productionCycle.protocoll,
      productionUnit.areaHa,
      productionCycle.protectionStructure,
      productionUnit.startDate,
      productionCycle.floweringDate,
      productionCycle.harvestingDate,
      productionUnit.endDate,
      productionCycle.occupazione ?? null,
      productionCycle.destinazioneDiUso ?? null,
      productionCycle.acquaTotalePeridoL,
      productionCycle.seasonYear,
      productionCycle.cycleIndex,
      productionCycle.createdAt,
      productionCycle.updatedAt,
    );
  }
}

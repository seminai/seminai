import { randomUUID } from 'node:crypto';
import {
  Field as PrismaField,
  ProductionUnit as PrismaProductionUnit,
  ProductionCycle as PrismaProductionCycle,
} from '@prisma/client';
import { ProductionUnit } from './ProductionUnit';
import { File } from './File';

/**
 * Field domain entity representing an agricultural field owned by a company.
 */
export class Field {
  constructor(
    public readonly id: string,
    public readonly companyId: string | null,
    public readonly sourceFileId: string | null,
    public readonly name: string,
    public readonly coordinates: number[],
    public readonly latitude: number | null,
    public readonly longitude: number | null,
    public readonly polygon: unknown | null,
    public readonly coordinatesGaussBoaga: number[],
    public readonly polygonGaussBoaga: unknown | null,
    public readonly gisHa: number | null,
    public readonly sauHa: number | null,
    public readonly ph: number | null,
    public readonly nitrogen: number | null,
    public readonly phosphorus: number | null,
    public readonly potassium: number | null,
    public readonly calcium: number | null,
    public readonly magnesium: number | null,
    public readonly soilType: string | null,
    public readonly uso: string | null,
    public readonly qualita: string | null,
    public readonly superficieCatastaleMq: number | null,
    public readonly sezione: string | null,
    public readonly foglio: string | null,
    public readonly particella: string | null,
    public readonly subalterno: string | null,
    public readonly nation: string | null,
    public readonly region: string | null,
    public readonly city: string | null,
    public readonly address: string | null,
    public readonly cap: string | null,
    public readonly variazioneMq: string | null,
    public readonly inizioConduzione: Date | null,
    public readonly fineConduzione: Date | null,
    public readonly bufferZoneNotes: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly productionUnits: readonly ProductionUnit[] = [],
    public readonly companyName?: string,
    public readonly sourceFile: File | null = null,
  ) {}

  /**
   * Factory method to create a new Field with generated id and timestamps.
   */
  static create(
    props: Omit<
      PrismaField,
      | 'id'
      | 'createdAt'
      | 'updatedAt'
      | 'coordinatesGaussBoaga'
      | 'polygonGaussBoaga'
      | 'sourceFileId'
    > & {
      coordinatesGaussBoaga?: number[];
      polygonGaussBoaga?: unknown;
      sourceFileId?: string | null;
    },
  ): Field {
    return new Field(
      randomUUID(),
      props.companyId,
      props.sourceFileId ?? null,
      props.name,
      props.coordinates,
      props.latitude ?? null,
      props.longitude ?? null,
      props.polygon ?? null,
      props.coordinatesGaussBoaga ?? [],
      props.polygonGaussBoaga ?? null,
      props.gisHa ?? null,
      props.sauHa ?? null,
      props.ph ?? null,
      props.nitrogen ?? null,
      props.phosphorus ?? null,
      props.potassium ?? null,
      props.calcium ?? null,
      props.magnesium ?? null,
      props.soilType ?? null,
      props.uso ?? null,
      props.qualita ?? null,
      props.superficieCatastaleMq ?? null,
      props.sezione ?? null,
      props.foglio ?? null,
      props.particella ?? null,
      props.subalterno ?? null,
      props.nation ?? null,
      props.region ?? null,
      props.city ?? null,
      props.address ?? null,
      props.cap ?? null,
      props.variazioneMq ?? null,
      props.inizioConduzione ?? null,
      props.fineConduzione ?? null,
      props.bufferZoneNotes ?? null,
      new Date(),
      new Date(),
      [],
      undefined,
      null,
    );
  }

  /**
   * Builds a Field domain entity from a Prisma Field record.
   */
  static fromPrisma(prismaField: PrismaField): Field {
    return new Field(
      prismaField.id,
      prismaField.companyId,
      prismaField.sourceFileId ?? null,
      prismaField.name,
      prismaField.coordinates,
      prismaField.latitude ?? null,
      prismaField.longitude ?? null,
      prismaField.polygon ?? null,
      prismaField.coordinatesGaussBoaga ?? [],
      prismaField.polygonGaussBoaga ?? null,
      prismaField.gisHa ?? null,
      prismaField.sauHa ?? null,
      prismaField.ph ?? null,
      prismaField.nitrogen ?? null,
      prismaField.phosphorus ?? null,
      prismaField.potassium ?? null,
      prismaField.calcium ?? null,
      prismaField.magnesium ?? null,
      prismaField.soilType ?? null,
      prismaField.uso ?? null,
      prismaField.qualita ?? null,
      prismaField.superficieCatastaleMq ?? null,
      prismaField.sezione ?? null,
      prismaField.foglio ?? null,
      prismaField.particella ?? null,
      prismaField.subalterno ?? null,
      prismaField.nation ?? null,
      prismaField.region ?? null,
      prismaField.city ?? null,
      prismaField.address ?? null,
      prismaField.cap ?? null,
      prismaField.variazioneMq ?? null,
      prismaField.inizioConduzione ?? null,
      prismaField.fineConduzione ?? null,
      prismaField.bufferZoneNotes ?? null,
      prismaField.createdAt,
      prismaField.updatedAt,
      [],
      undefined,
      null,
    );
  }

  /**
   * Builds a Field domain entity from a Prisma Field record including relations.
   */
  static fromPrismaWithRelations(
    prismaField: PrismaField & {
      productionUnitsOnFields?: {
        productionUnit: PrismaProductionUnit & { cycles: PrismaProductionCycle[] };
      }[];
      company?: { name: string } | null;
      sourceFile?: {
        id: string;
        name: string;
        url: string;
        companyId: string;
        path: string | null;
        type: string | null;
        metadata: unknown;
        createdAt: Date;
        updatedAt: Date;
      } | null;
    },
  ): Field {
    const productionUnits: ProductionUnit[] = (prismaField.productionUnitsOnFields || []).map(
      (link) => {
        const cycle =
          link.productionUnit.cycles.length > 0
            ? link.productionUnit.cycles[0]
            : {
                id: randomUUID(),
                cropName: '',
                cropType: '',
                variety: '',
                protocoll: '',
                areaHa: 0,
                protectionStructure: '',
                startDate: new Date(),
                floweringDate: new Date(),
                harvestingDate: new Date(),
                endDate: new Date(),
                occupazione: null,
                destinazioneDiUso: null,
                acquaTotalePeridoL: 0,
                seasonYear: new Date().getUTCFullYear(),
                cycleIndex: 1,
                createdAt: link.productionUnit.createdAt,
                updatedAt: link.productionUnit.updatedAt,
              };
        return ProductionUnit.fromPrisma({
          productionUnit: link.productionUnit,
          productionCycle: cycle,
        });
      },
    );
    return new Field(
      prismaField.id,
      prismaField.companyId,
      prismaField.sourceFileId ?? null,
      prismaField.name,
      prismaField.coordinates,
      prismaField.latitude ?? null,
      prismaField.longitude ?? null,
      prismaField.polygon ?? null,
      prismaField.coordinatesGaussBoaga ?? [],
      prismaField.polygonGaussBoaga ?? null,
      prismaField.gisHa ?? null,
      prismaField.sauHa ?? null,
      prismaField.ph ?? null,
      prismaField.nitrogen ?? null,
      prismaField.phosphorus ?? null,
      prismaField.potassium ?? null,
      prismaField.calcium ?? null,
      prismaField.magnesium ?? null,
      prismaField.soilType ?? null,
      prismaField.uso ?? null,
      prismaField.qualita ?? null,
      prismaField.superficieCatastaleMq ?? null,
      prismaField.sezione ?? null,
      prismaField.foglio ?? null,
      prismaField.particella ?? null,
      prismaField.subalterno ?? null,
      prismaField.nation ?? null,
      prismaField.region ?? null,
      prismaField.city ?? null,
      prismaField.address ?? null,
      prismaField.cap ?? null,
      prismaField.variazioneMq ?? null,
      prismaField.inizioConduzione ?? null,
      prismaField.fineConduzione ?? null,
      prismaField.bufferZoneNotes ?? null,
      prismaField.createdAt,
      prismaField.updatedAt,
      productionUnits,
      prismaField.company?.name,
      prismaField.sourceFile
        ? new File(
            prismaField.sourceFile.id,
            prismaField.sourceFile.name,
            prismaField.sourceFile.url,
            prismaField.sourceFile.companyId,
            prismaField.sourceFile.path ?? undefined,
            prismaField.sourceFile.type ?? undefined,
            prismaField.sourceFile.metadata ?? undefined,
            prismaField.sourceFile.createdAt,
            prismaField.sourceFile.updatedAt,
          )
        : null,
    );
  }
}

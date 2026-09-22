import { ProductionUnit } from '../entities/ProductionUnit';

export interface ProductionUnitCycleCreateInput {
  readonly cropName: string;
  readonly cropType: string;
  readonly variety: string;
  readonly protocoll: string;
  readonly protectionStructure: string;
  readonly floweringDate: Date | null;
  readonly harvestingDate: Date | null;
  readonly occupazione?: string | null;
  readonly destinazioneDiUso?: string | null;
  readonly acquaTotalePeridoL: number;
  readonly seasonYear: number;
  readonly cycleIndex: number;
}

export interface IProductionUnitRepository {
  create(
    pu: ProductionUnit,
    allocations: Array<{ fieldId: string; areaHaOnField: number }>,
  ): Promise<ProductionUnit>;
  createMany(pus: ProductionUnit[]): Promise<void>;
  createBulk(
    productionUnits: Array<{
      productionUnit: ProductionUnit;
      allocations: Array<{ fieldId: string; areaHaOnField: number }>;
      additionalCycles?: readonly ProductionUnitCycleCreateInput[];
    }>,
  ): Promise<ProductionUnit[]>;
  findById(id: string): Promise<ProductionUnit | null>;
  findManyByFieldId(fieldId: string): Promise<ProductionUnit[]>;
  sumAreaByFieldAndOverlappingRange(
    fieldId: string,
    range: { startDate: Date; endDate: Date },
  ): Promise<number>;
  findOverlappingByField(
    fieldId: string,
    range: { startDate: Date; endDate: Date },
  ): Promise<
    Array<{
      productionUnitId: string;
      productionUnitName: string;
      cropName: string | null;
      startDate: Date;
      endDate: Date;
      areaHaOnField: number;
    }>
  >;
  listFieldIdsByProductionUnit(productionUnitId: string): Promise<string[]>;
  listCompanyIdsByProductionUnit(productionUnitId: string): Promise<string[]>;
  getAllocationsByProductionUnit(
    productionUnitId: string,
  ): Promise<Array<{ fieldId: string; areaHaOnField: number }>>;
  getOverlappingDateWindow(
    fieldId: string,
    range: { startDate: Date; endDate: Date },
  ): Promise<{ earliestStart: Date | null; latestEnd: Date | null }>;
  replaceAllocations(
    productionUnitId: string,
    allocations: Array<{ fieldId: string; areaHaOnField: number }>,
  ): Promise<void>;
  update(id: string, data: Partial<ProductionUnit>): Promise<ProductionUnit>;
  updateMany(updates: Array<{ id: string; data: Partial<ProductionUnit> }>): Promise<number>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
  /** Deletes every production unit whose linked fields belong to the given company. */
  deleteAllByCompanyId(companyId: string): Promise<number>;
  findManyByUserId(userId: string): Promise<
    Array<{
      productionUnit: ProductionUnit;
      companyId: string;
      companyName: string;
      field: {
        id: string;
        name: string;
        sauHa: number | null;
        gisHa: number | null;
      };
      areaHaOnField: number;
    }>
  >;
  findManyByUserIdAndCrop(
    userId: string,
    cropName: string,
  ): Promise<
    Array<{
      productionUnit: ProductionUnit;
      companyId: string;
      companyName: string;
      field: {
        id: string;
        name: string;
        sauHa: number | null;
        gisHa: number | null;
      };
      areaHaOnField: number;
    }>
  >;
  findManyByUserIdAndCompanyIds(
    userId: string,
    companyIds: string[],
  ): Promise<
    Array<{
      productionUnit: ProductionUnit;
      companyId: string;
      companyName: string;
      field: {
        id: string;
        name: string;
        sauHa: number | null;
        gisHa: number | null;
      };
      areaHaOnField: number;
    }>
  >;
}

export default IProductionUnitRepository;

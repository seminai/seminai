import { PrismaClient, type ProductionCycle } from '@prisma/client';
import { ProductionUnit } from '../../domain/entities/ProductionUnit';
import { type ProductionUnitCycleCreateInput } from '../../domain/repositories/IProductionUnitRepository';

export interface PrismaProductionUnitRepositoryContext {
  readonly prisma: PrismaClient;
  toDate(value: string | Date | null | undefined): Date | undefined;
  toDateNullable(value: string | Date | null | undefined): Date | null | undefined;
  create(pu: ProductionUnit, allocations: Array<{ fieldId: string; areaHaOnField: number }>): Promise<ProductionUnit>;
  createWithCycles(pu: ProductionUnit, allocations: Array<{ fieldId: string; areaHaOnField: number }>, additionalCycles: readonly ProductionUnitCycleCreateInput[]): Promise<ProductionUnit>;
  createMany(pus: ProductionUnit[]): Promise<void>;
  createBulk(productionUnits: Array<{
      productionUnit: ProductionUnit;
      allocations: Array<{ fieldId: string; areaHaOnField: number }>;
      additionalCycles?: readonly ProductionUnitCycleCreateInput[];
    }>): Promise<ProductionUnit[]>;
  createCyclesForUnit(productionUnitId: string, pu: ProductionUnit, additionalCycles: readonly ProductionUnitCycleCreateInput[]): Promise<ProductionCycle[]>;
  findById(id: string): Promise<ProductionUnit | null>;
  findManyByFieldId(fieldId: string): Promise<ProductionUnit[]>;
  sumAreaByFieldAndOverlappingRange(fieldId: string, range: { startDate: Date; endDate: Date }): Promise<number>;
  findOverlappingByField(fieldId: string, range: { startDate: Date; endDate: Date }): Promise<
    Array<{
      productionUnitId: string;
      productionUnitName: string;
      cropName: string | null;
      startDate: Date;
      endDate: Date;
      areaHaOnField: number;
    }>
  >;
  getOverlappingDateWindow(fieldId: string, range: { startDate: Date; endDate: Date }): Promise<{ earliestStart: Date | null; latestEnd: Date | null }>;
  update(id: string, data: Partial<ProductionUnit>): Promise<ProductionUnit>;
  listFieldIdsByProductionUnit(productionUnitId: string): Promise<string[]>;
  listCompanyIdsByProductionUnit(productionUnitId: string): Promise<string[]>;
  getAllocationsByProductionUnit(productionUnitId: string): Promise<Array<{ fieldId: string; areaHaOnField: number }>>;
  replaceAllocations(productionUnitId: string, allocations: Array<{ fieldId: string; areaHaOnField: number }>): Promise<void>;
  updateMany(updates: Array<{ id: string; data: Partial<ProductionUnit> }>): Promise<number>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
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
  findManyByUserIdAndCrop(userId: string, cropName: string): Promise<
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
  findManyByUserIdAndCompanyIds(userId: string, companyIds: string[]): Promise<
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

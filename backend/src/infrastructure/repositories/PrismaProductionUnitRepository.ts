import { PrismaClient } from '@prisma/client';
import { ProductionUnit } from '../../domain/entities/ProductionUnit';
import { IProductionUnitRepository, type ProductionUnitCycleCreateInput } from '../../domain/repositories/IProductionUnitRepository';
import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';
import { prismaProductionUnitRepositoryToDate } from './prisma-production-unit-repository.01-to-date';
import { prismaProductionUnitRepositoryToDateNullable } from './prisma-production-unit-repository.02-to-date-nullable';
import { prismaProductionUnitRepositoryCreate } from './prisma-production-unit-repository.03-create';
import { prismaProductionUnitRepositoryCreateWithCycles } from './prisma-production-unit-repository.04-create-with-cycles';
import { prismaProductionUnitRepositoryCreateMany } from './prisma-production-unit-repository.05-create-many';
import { prismaProductionUnitRepositoryCreateBulk } from './prisma-production-unit-repository.06-create-bulk';
import { prismaProductionUnitRepositoryCreateCyclesForUnit } from './prisma-production-unit-repository.07-create-cycles-for-unit';
import { prismaProductionUnitRepositoryFindById } from './prisma-production-unit-repository.08-find-by-id';
import { prismaProductionUnitRepositoryFindManyByFieldId } from './prisma-production-unit-repository.09-find-many-by-field-id';
import { prismaProductionUnitRepositorySumAreaByFieldAndOverlappingRange } from './prisma-production-unit-repository.10-sum-area-by-field-and-overlapping-range';
import { prismaProductionUnitRepositoryFindOverlappingByField } from './prisma-production-unit-repository.11-find-overlapping-by-field';
import { prismaProductionUnitRepositoryGetOverlappingDateWindow } from './prisma-production-unit-repository.12-get-overlapping-date-window';
import { prismaProductionUnitRepositoryUpdate } from './prisma-production-unit-repository.13-update';
import { prismaProductionUnitRepositoryListFieldIdsByProductionUnit } from './prisma-production-unit-repository.14-list-field-ids-by-production-unit';
import { prismaProductionUnitRepositoryListCompanyIdsByProductionUnit } from './prisma-production-unit-repository.15-list-company-ids-by-production-unit';
import { prismaProductionUnitRepositoryGetAllocationsByProductionUnit } from './prisma-production-unit-repository.16-get-allocations-by-production-unit';
import { prismaProductionUnitRepositoryReplaceAllocations } from './prisma-production-unit-repository.17-replace-allocations';
import { prismaProductionUnitRepositoryUpdateMany } from './prisma-production-unit-repository.18-update-many';
import { prismaProductionUnitRepositoryDelete } from './prisma-production-unit-repository.19-delete';
import { prismaProductionUnitRepositoryDeleteMany } from './prisma-production-unit-repository.20-delete-many';
import { prismaProductionUnitRepositoryDeleteAllByCompanyId } from './prisma-production-unit-repository.21-delete-all-by-company-id';
import { prismaProductionUnitRepositoryFindManyByUserId } from './prisma-production-unit-repository.22-find-many-by-user-id';
import { prismaProductionUnitRepositoryFindManyByUserIdAndCrop } from './prisma-production-unit-repository.23-find-many-by-user-id-and-crop';
import { prismaProductionUnitRepositoryFindManyByUserIdAndCompanyIds } from './prisma-production-unit-repository.24-find-many-by-user-id-and-company-ids';


export class PrismaProductionUnitRepository implements IProductionUnitRepository {

  constructor(readonly prisma: PrismaClient) {}

  toDate(value: string | Date | null | undefined): Date | undefined {
    return prismaProductionUnitRepositoryToDate.call(this as unknown as PrismaProductionUnitRepositoryContext, value);
  }

  toDateNullable(value: string | Date | null | undefined): Date | null | undefined {
    return prismaProductionUnitRepositoryToDateNullable.call(this as unknown as PrismaProductionUnitRepositoryContext, value);
  }

  async create(
    pu: ProductionUnit,
    allocations: Array<{ fieldId: string; areaHaOnField: number }>,
  ): Promise<ProductionUnit> {
    return prismaProductionUnitRepositoryCreate.call(this as unknown as PrismaProductionUnitRepositoryContext, pu, allocations);
  }

  async createWithCycles(
    pu: ProductionUnit,
    allocations: Array<{ fieldId: string; areaHaOnField: number }>,
    additionalCycles: readonly ProductionUnitCycleCreateInput[],
  ): Promise<ProductionUnit> {
    return prismaProductionUnitRepositoryCreateWithCycles.call(this as unknown as PrismaProductionUnitRepositoryContext, pu, allocations, additionalCycles);
  }

  async createMany(pus: ProductionUnit[]): Promise<void> {
    return prismaProductionUnitRepositoryCreateMany.call(this as unknown as PrismaProductionUnitRepositoryContext, pus);
  }

  async createBulk(
    productionUnits: Array<{
      productionUnit: ProductionUnit;
      allocations: Array<{ fieldId: string; areaHaOnField: number }>;
      additionalCycles?: readonly ProductionUnitCycleCreateInput[];
    }>,
  ): Promise<ProductionUnit[]> {
    return prismaProductionUnitRepositoryCreateBulk.call(this as unknown as PrismaProductionUnitRepositoryContext, productionUnits);
  }

  async createCyclesForUnit(
    productionUnitId: string,
    pu: ProductionUnit,
    additionalCycles: readonly ProductionUnitCycleCreateInput[],
  ) {
    return prismaProductionUnitRepositoryCreateCyclesForUnit.call(this as unknown as PrismaProductionUnitRepositoryContext, productionUnitId, pu, additionalCycles);
  }

  async findById(id: string): Promise<ProductionUnit | null> {
    return prismaProductionUnitRepositoryFindById.call(this as unknown as PrismaProductionUnitRepositoryContext, id);
  }

  async findManyByFieldId(fieldId: string): Promise<ProductionUnit[]> {
    return prismaProductionUnitRepositoryFindManyByFieldId.call(this as unknown as PrismaProductionUnitRepositoryContext, fieldId);
  }

  async sumAreaByFieldAndOverlappingRange(
    fieldId: string,
    range: { startDate: Date; endDate: Date },
  ): Promise<number> {
    return prismaProductionUnitRepositorySumAreaByFieldAndOverlappingRange.call(this as unknown as PrismaProductionUnitRepositoryContext, fieldId, range);
  }

  async findOverlappingByField(
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
  > {
    return prismaProductionUnitRepositoryFindOverlappingByField.call(this as unknown as PrismaProductionUnitRepositoryContext, fieldId, range);
  }

  async getOverlappingDateWindow(
    fieldId: string,
    range: { startDate: Date; endDate: Date },
  ): Promise<{ earliestStart: Date | null; latestEnd: Date | null }> {
    return prismaProductionUnitRepositoryGetOverlappingDateWindow.call(this as unknown as PrismaProductionUnitRepositoryContext, fieldId, range);
  }

  async update(id: string, data: Partial<ProductionUnit>): Promise<ProductionUnit> {
    return prismaProductionUnitRepositoryUpdate.call(this as unknown as PrismaProductionUnitRepositoryContext, id, data);
  }

  async listFieldIdsByProductionUnit(productionUnitId: string): Promise<string[]> {
    return prismaProductionUnitRepositoryListFieldIdsByProductionUnit.call(this as unknown as PrismaProductionUnitRepositoryContext, productionUnitId);
  }

  async listCompanyIdsByProductionUnit(productionUnitId: string): Promise<string[]> {
    return prismaProductionUnitRepositoryListCompanyIdsByProductionUnit.call(this as unknown as PrismaProductionUnitRepositoryContext, productionUnitId);
  }

  async getAllocationsByProductionUnit(
    productionUnitId: string,
  ): Promise<Array<{ fieldId: string; areaHaOnField: number }>> {
    return prismaProductionUnitRepositoryGetAllocationsByProductionUnit.call(this as unknown as PrismaProductionUnitRepositoryContext, productionUnitId);
  }

  async replaceAllocations(
    productionUnitId: string,
    allocations: Array<{ fieldId: string; areaHaOnField: number }>,
  ): Promise<void> {
    return prismaProductionUnitRepositoryReplaceAllocations.call(this as unknown as PrismaProductionUnitRepositoryContext, productionUnitId, allocations);
  }

  async updateMany(updates: Array<{ id: string; data: Partial<ProductionUnit> }>): Promise<number> {
    return prismaProductionUnitRepositoryUpdateMany.call(this as unknown as PrismaProductionUnitRepositoryContext, updates);
  }

  async delete(id: string): Promise<void> {
    return prismaProductionUnitRepositoryDelete.call(this as unknown as PrismaProductionUnitRepositoryContext, id);
  }

  async deleteMany(ids: string[]): Promise<void> {
    return prismaProductionUnitRepositoryDeleteMany.call(this as unknown as PrismaProductionUnitRepositoryContext, ids);
  }

  async deleteAllByCompanyId(companyId: string): Promise<number> {
    return prismaProductionUnitRepositoryDeleteAllByCompanyId.call(this as unknown as PrismaProductionUnitRepositoryContext, companyId);
  }

  async findManyByUserId(userId: string): Promise<
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
  > {
    return prismaProductionUnitRepositoryFindManyByUserId.call(this as unknown as PrismaProductionUnitRepositoryContext, userId);
  }

  async findManyByUserIdAndCrop(
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
  > {
    return prismaProductionUnitRepositoryFindManyByUserIdAndCrop.call(this as unknown as PrismaProductionUnitRepositoryContext, userId, cropName);
  }

  async findManyByUserIdAndCompanyIds(
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
  > {
    return prismaProductionUnitRepositoryFindManyByUserIdAndCompanyIds.call(this as unknown as PrismaProductionUnitRepositoryContext, userId, companyIds);
  }
}

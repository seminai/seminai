import { PrismaClient } from '@prisma/client';
import { Field } from '../../domain/entities/Field';
import { IFieldRepository } from '../../domain/repositories/IFieldRepository';
import type { PrismaFieldRepositoryContext } from './prisma-field-repository.context';
import { prismaFieldRepositoryAreNumbersClose } from './prisma-field-repository.01-are-numbers-close';
import { prismaFieldRepositoryAreCoordinatesClose } from './prisma-field-repository.02-are-coordinates-close';
import { prismaFieldRepositoryFindExistingByShapefileData } from './prisma-field-repository.03-find-existing-by-shapefile-data';
import { prismaFieldRepositoryCreate } from './prisma-field-repository.04-create';
import { prismaFieldRepositoryCreateMany } from './prisma-field-repository.05-create-many';
import { prismaFieldRepositoryFindById } from './prisma-field-repository.06-find-by-id';
import { prismaFieldRepositoryFindManyByCompanyId } from './prisma-field-repository.07-find-many-by-company-id';
import { prismaFieldRepositoryFindManyByUserId } from './prisma-field-repository.08-find-many-by-user-id';
import { prismaFieldRepositoryFindByCadastralReference } from './prisma-field-repository.09-find-by-cadastral-reference';
import { prismaFieldRepositoryUpdate } from './prisma-field-repository.10-update';
import { prismaFieldRepositoryUpdateMany } from './prisma-field-repository.11-update-many';
import { prismaFieldRepositoryUpsertMany } from './prisma-field-repository.12-upsert-many';
import { prismaFieldRepositoryDelete } from './prisma-field-repository.13-delete';
import { prismaFieldRepositoryDeleteMany } from './prisma-field-repository.14-delete-many';
import { prismaFieldRepositoryDeleteAllByCompanyId } from './prisma-field-repository.15-delete-all-by-company-id';
import { prismaFieldRepositoryClearSourceFileIds } from './prisma-field-repository.16-clear-source-file-ids';


export class PrismaFieldRepository implements IFieldRepository {

  constructor(readonly prisma: PrismaClient) {}
  areNumbersClose(a: number, b: number, tolerance: number): boolean {
    return prismaFieldRepositoryAreNumbersClose.call(this as unknown as PrismaFieldRepositoryContext, a, b, tolerance);
  }

  areCoordinatesClose(
    a: readonly number[],
    b: readonly number[],
    tolerance: number,
  ): boolean {
    return prismaFieldRepositoryAreCoordinatesClose.call(this as unknown as PrismaFieldRepositoryContext, a, b, tolerance);
  }

  async findExistingByShapefileData(field: Field): Promise<{ id: string } | null> {
    return prismaFieldRepositoryFindExistingByShapefileData.call(this as unknown as PrismaFieldRepositoryContext, field);
  }

  async create(field: Field): Promise<Field> {
    return prismaFieldRepositoryCreate.call(this as unknown as PrismaFieldRepositoryContext, field);
  }

  async createMany(fields: Field[]): Promise<void> {
    return prismaFieldRepositoryCreateMany.call(this as unknown as PrismaFieldRepositoryContext, fields);
  }

  async findById(id: string): Promise<Field | null> {
    return prismaFieldRepositoryFindById.call(this as unknown as PrismaFieldRepositoryContext, id);
  }

  async findManyByCompanyId(companyId: string): Promise<Field[]> {
    return prismaFieldRepositoryFindManyByCompanyId.call(this as unknown as PrismaFieldRepositoryContext, companyId);
  }

  async findManyByUserId(userId: string): Promise<Field[]> {
    return prismaFieldRepositoryFindManyByUserId.call(this as unknown as PrismaFieldRepositoryContext, userId);
  }

  async findByCadastralReference(params: {
    companyId: string;
    sezione?: string | null;
    foglio: string;
    particella: string;
    subalterno?: string | null;
  }): Promise<Field | null> {
    return prismaFieldRepositoryFindByCadastralReference.call(this as unknown as PrismaFieldRepositoryContext, params);
  }

  async update(id: string, data: Partial<Field>): Promise<Field> {
    return prismaFieldRepositoryUpdate.call(this as unknown as PrismaFieldRepositoryContext, id, data);
  }

  async updateMany(updates: Array<{ id: string; data: Partial<Field> }>): Promise<number> {
    return prismaFieldRepositoryUpdateMany.call(this as unknown as PrismaFieldRepositoryContext, updates);
  }

  async upsertMany(fields: Field[]): Promise<Field[]> {
    return prismaFieldRepositoryUpsertMany.call(this as unknown as PrismaFieldRepositoryContext, fields);
  }

  async delete(id: string): Promise<void> {
    return prismaFieldRepositoryDelete.call(this as unknown as PrismaFieldRepositoryContext, id);
  }

  /**
   * Delete multiple fields by their IDs.
   * Also deletes related productionUnitOnField records in a transaction.
   * @param ids - Array of field IDs to delete
   */
  async deleteMany(ids: string[]): Promise<void> {
    return prismaFieldRepositoryDeleteMany.call(this as unknown as PrismaFieldRepositoryContext, ids);
  }

  async deleteAllByCompanyId(companyId: string): Promise<number> {
    return prismaFieldRepositoryDeleteAllByCompanyId.call(this as unknown as PrismaFieldRepositoryContext, companyId);
  }

  async clearSourceFileIds(fileIds: readonly string[]): Promise<number> {
    return prismaFieldRepositoryClearSourceFileIds.call(this as unknown as PrismaFieldRepositoryContext, fileIds);
  }
}

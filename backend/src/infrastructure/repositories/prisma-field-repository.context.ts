import { PrismaClient } from '@prisma/client';
import { Field } from '../../domain/entities/Field';

export interface PrismaFieldRepositoryContext {
  readonly prisma: PrismaClient;
  areNumbersClose(a: number, b: number, tolerance: number): boolean;
  areCoordinatesClose(a: readonly number[], b: readonly number[], tolerance: number): boolean;
  findExistingByShapefileData(field: Field): Promise<{ id: string } | null>;
  create(field: Field): Promise<Field>;
  createMany(fields: Field[]): Promise<void>;
  findById(id: string): Promise<Field | null>;
  findManyByCompanyId(companyId: string): Promise<Field[]>;
  findManyByUserId(userId: string): Promise<Field[]>;
  findByCadastralReference(params: {
    companyId: string;
    sezione?: string | null;
    foglio: string;
    particella: string;
    subalterno?: string | null;
  }): Promise<Field | null>;
  update(id: string, data: Partial<Field>): Promise<Field>;
  updateMany(updates: Array<{ id: string; data: Partial<Field> }>): Promise<number>;
  upsertMany(fields: Field[]): Promise<Field[]>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
  deleteAllByCompanyId(companyId: string): Promise<number>;
  clearSourceFileIds(fileIds: readonly string[]): Promise<number>;
}

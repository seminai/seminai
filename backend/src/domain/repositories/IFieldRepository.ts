import { Field } from '../entities/Field';

export interface IFieldRepository {
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
  /** Deletes every field belonging to the given company. Used by the "Campi" cascade. */
  deleteAllByCompanyId(companyId: string): Promise<number>;
  /** Clears the `sourceFileId` of fields that reference any of the given files, so the files can be deleted. */
  clearSourceFileIds(fileIds: readonly string[]): Promise<number>;
}

export default IFieldRepository;

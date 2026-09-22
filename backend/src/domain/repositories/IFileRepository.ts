import { File } from '../entities/File';

/** Params for querying files approaching their expiry date. */
export interface FindExpiringParams {
  readonly referenceDate: Date;
  readonly alertStatuses: readonly string[];
}

export interface IFileRepository {
  save(file: File): Promise<File>;
  findById(id: string): Promise<File | null>;
  findByCompanyId(companyId: string): Promise<File[]>;
  deleteBulk(ids: string[]): Promise<void>;
  findByIds(ids: string[]): Promise<File[]>;
  /** Finds files with a set expiresAt that are within their reminder window. */
  findExpiring(params: FindExpiringParams): Promise<File[]>;
  /** Updates only the alertStatus field on a file. */
  updateAlertStatus(id: string, alertStatus: string): Promise<void>;
}

import { AppError } from '../../../domain/errors/AppError';
import type { IFileStorage } from '../../../domain/services/IFileStorage';
import type { IFileStorageReader } from '../../../domain/services/IFileStorageReader';
import { LocalFileStorage } from './LocalFileStorage';
import { S3FileStorage } from './S3FileStorage';

let storage: (IFileStorage & IFileStorageReader) | undefined;

/** Creates the configured storage adapter without initializing unused drivers. */
export function createFileStorage(): IFileStorage & IFileStorageReader {
  if (storage) return storage;
  const driver = process.env.STORAGE_DRIVER || 'local';
  if (driver === 'local') storage = new LocalFileStorage();
  if (driver === 's3') {
    storage = new S3FileStorage({
      bucket: process.env.S3_BUCKET || '',
      region: process.env.S3_REGION || '',
      endpoint: process.env.S3_ENDPOINT,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    });
  }
  if (!storage) {
    throw AppError.badRequest(`Unsupported storage driver: ${driver}`, 'INVALID_STORAGE_DRIVER');
  }
  return storage;
}

/** Clears the cached adapter so tests can switch drivers. */
export function resetFileStorageCache(): void {
  storage = undefined;
}

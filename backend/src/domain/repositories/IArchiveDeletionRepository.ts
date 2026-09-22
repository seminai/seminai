import type { DeleteFilesBulkDTO, DeleteFilesBulkResult } from '../dtos/delete-files-bulk.dto';

/**
 * Repository port for destructive archive bulk deletion operations.
 */
export interface IArchiveDeletionRepository {
  deleteBulk(dto: DeleteFilesBulkDTO): Promise<DeleteFilesBulkResult>;
}

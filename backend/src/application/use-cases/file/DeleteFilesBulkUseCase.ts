import { IFileRepository } from '../../../domain/repositories/IFileRepository';
import { IArchiveDeletionRepository } from '../../../domain/repositories/IArchiveDeletionRepository';
import {
  DeleteFilesBulkDTO,
  DeleteFilesBulkResult,
} from '../../../domain/dtos/delete-files-bulk.dto';
import { AppError } from '../../../domain/errors/AppError';

/**
 * Removes archive files and cascades to related entities according to the DTO flags.
 *
 * Always cascades stocks linked via `Stock.sourceFileId` because a confirmed PDF
 * (DDT/Invoice) generates a stock load that has no meaning without its source.
 * Other cascades (fields/production units/all stocks/field notes) are opt-in and
 * triggered by deleting the matching system files ("Campi", "Unità Produttive",
 * "Magazzino", "Note di Campo").
 */
export class DeleteFilesBulkUseCase {
  constructor(
    private readonly fileRepository: IFileRepository,
    private readonly archiveDeletionRepository: IArchiveDeletionRepository,
  ) {}

  async execute(dto: DeleteFilesBulkDTO): Promise<DeleteFilesBulkResult> {
    const { ids, companyId } = dto;
    await this.assertOwnership(ids, companyId);
    return this.archiveDeletionRepository.deleteBulk(dto);
  }

  private async assertOwnership(ids: readonly string[], companyId: string): Promise<void> {
    if (ids.length === 0) return;
    const files = await this.fileRepository.findByIds([...ids]);
    const foreign = files.find((f) => f.companyId !== companyId);
    if (foreign) {
      throw AppError.forbidden(
        `File ${foreign.id} does not belong to company ${companyId}`,
        'FILE_COMPANY_MISMATCH',
      );
    }
  }
}

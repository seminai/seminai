import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { FileService } from '../../services/FileService';
import { IFileRepository } from '../../../domain/repositories/IFileRepository';
import { File } from '../../../domain/entities/File';
import { randomUUID } from 'crypto';
import type { UpdateFileExpiryDTO, ExpiringFileDTO } from '../../../domain/dtos/file-expiry.dto';
import type { DeleteFilesBulkCascade } from '../../../domain/dtos/delete-files-bulk.dto';
import { DeleteFilesBulkUseCase } from '../../../application/use-cases/file/DeleteFilesBulkUseCase';
import { ResourceAccessGuard } from '../../../application/use-cases/access/ResourceAccessGuard';

export class FileController {
  constructor(
    private readonly fileRepository: IFileRepository,
    private readonly deleteFilesBulkUseCase: DeleteFilesBulkUseCase,
    private readonly accessGuard: ResourceAccessGuard,
  ) {}

  private requireUser(request: Request): string {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    return request.user.id;
  }

  /**
   * Upload a file to a specific path in the user's bucket folder and save to DB
   * @param request
   * @param response
   */
  async upload(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { path, companyId } = request.body as { path?: string; companyId?: string };

    if (!request.file) {
      throw AppError.badRequest('Missing file', 'MISSING_FILE');
    }

    if (!path) {
      throw AppError.badRequest('Missing path', 'MISSING_PATH');
    }

    if (!companyId) {
      throw AppError.badRequest('Missing companyId', 'MISSING_COMPANY_ID');
    }

    // Create instance of FileService with userId
    const fileService = new FileService(request.user.id);

    // Determine file type (optional, or derived from mimetype)
    const type = request.body.type || request.file.mimetype;

    // Upload to Cloud Storage
    const publicUrl = await fileService.uploadFile(request.file, request.user.id, path, type);

    // Create Domain Entity
    const newFile = new File(
      randomUUID(),
      request.file.originalname,
      publicUrl,
      companyId,
      path,
      type,
      {
        size: request.file.size,
        mimeType: request.file.mimetype,
        uploadedBy: request.user.id,
      },
    );

    // Save to Repository
    const savedFile = await this.fileRepository.save(newFile);

    return response.status(200).json({
      status: 'success',
      data: {
        file: savedFile,
      },
    });
  }

  /**
   * Get file by ID
   */
  async getById(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;

    if (!id) {
      throw AppError.badRequest('Missing file ID', 'MISSING_FILE_ID');
    }

    const file = await this.accessGuard.assertFile(userId, id);

    return response.status(200).json({
      status: 'success',
      data: { file },
    });
  }

  /**
   * List files by company
   */
  async list(request: Request, response: Response): Promise<Response> {
    const { companyId } = request.query as { companyId: string };

    if (!companyId) {
      throw AppError.badRequest('Missing companyId query param', 'MISSING_COMPANY_ID');
    }

    const files = await this.fileRepository.findByCompanyId(companyId);

    return response.status(200).json({
      status: 'success',
      data: { files },
    });
  }

  /**
   * Update file metadata
   */
  async update(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;
    const { name, type, metadata } = request.body;

    if (!id) {
      throw AppError.badRequest('Missing file ID', 'MISSING_FILE_ID');
    }

    const existingFile = await this.accessGuard.assertFile(userId, id);

    // Update fields
    const updatedFile = new File(
      existingFile.id,
      name || existingFile.name,
      existingFile.url,
      existingFile.companyId,
      existingFile.path,
      type || existingFile.type,
      metadata
        ? { ...(existingFile.metadata as Record<string, unknown>), ...metadata }
        : existingFile.metadata,
      existingFile.createdAt,
      new Date(), // updatedAt
      existingFile.expiresAt,
      existingFile.reminderDaysBefore,
      existingFile.alertStatus,
    );

    const saved = await this.fileRepository.save(updatedFile);

    return response.status(200).json({
      status: 'success',
      data: { file: saved },
    });
  }

  /**
   * Update file expiry settings. Resets alertStatus to 'none' when expiry changes.
   */
  async updateExpiry(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;
    const { expiresAt, reminderDaysBefore } = request.body as UpdateFileExpiryDTO;
    if (!id) {
      throw AppError.badRequest('Missing file ID', 'MISSING_FILE_ID');
    }
    const existingFile = await this.accessGuard.assertFile(userId, id);
    const parsedExpiry = expiresAt
      ? new Date(expiresAt)
      : expiresAt === null
        ? undefined
        : existingFile.expiresAt;
    const updatedFile = new File(
      existingFile.id,
      existingFile.name,
      existingFile.url,
      existingFile.companyId,
      existingFile.path,
      existingFile.type,
      existingFile.metadata,
      existingFile.createdAt,
      new Date(),
      parsedExpiry,
      reminderDaysBefore ?? existingFile.reminderDaysBefore,
      'none',
    );
    const saved = await this.fileRepository.save(updatedFile);
    return response.status(200).json({ status: 'success', data: { file: saved } });
  }

  /**
   * List files approaching their expiry date for a company.
   */
  async listExpiring(request: Request, response: Response): Promise<Response> {
    const { companyId } = request.query as { companyId: string };
    if (!companyId) {
      throw AppError.badRequest('Missing companyId query param', 'MISSING_COMPANY_ID');
    }
    const now = new Date();
    const files = await this.fileRepository.findExpiring({
      referenceDate: now,
      alertStatuses: ['none', 'scheduled', 'sent'],
    });
    const companyFiles = files.filter((f) => f.companyId === companyId);
    const result: ExpiringFileDTO[] = companyFiles.map((f) => ({
      id: f.id,
      name: f.name,
      companyId: f.companyId,
      expiresAt: f.expiresAt!.toISOString(),
      reminderDaysBefore: f.reminderDaysBefore ?? 30,
      alertStatus: f.alertStatus ?? 'none',
      daysUntilExpiry: Math.ceil((f.expiresAt!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    }));
    return response.status(200).json({ status: 'success', data: { files: result } });
  }

  /**
   * Delete files in bulk with optional cascade on related entities.
   *
   * Body: { ids: string[]; companyId: string; cascade?: DeleteFilesBulkCascade }
   *
   * Stocks referencing the deleted files via `sourceFileId` are always removed
   * (confirmed PDFs → generated stock loads). The optional `cascade` flags
   * trigger full-company deletion of fields / production units / stocks /
   * field notes, used when the user removes the corresponding system files
   * ("Campi", "Unità Produttive", "Magazzino", "Note di Campo").
   */
  async deleteBulk(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { ids, companyId, extractionIds, cascade } = request.body as {
      ids?: string[];
      companyId?: string;
      extractionIds?: string[];
      cascade?: DeleteFilesBulkCascade;
    };

    if (!companyId) {
      throw AppError.badRequest('Missing companyId', 'MISSING_COMPANY_ID');
    }

    const safeIds = Array.isArray(ids) ? ids : [];
    const safeExtractionIds = Array.isArray(extractionIds) ? extractionIds : [];
    const hasCascade = Boolean(
      cascade?.fields ||
        cascade?.productionUnits ||
        cascade?.stocksAll ||
        cascade?.productsAll ||
        cascade?.fieldNotes,
    );

    if (safeIds.length === 0 && safeExtractionIds.length === 0 && !hasCascade) {
      throw AppError.badRequest('Missing or invalid ids array', 'INVALID_IDS');
    }

    const filesToDelete = safeIds.length > 0 ? await this.fileRepository.findByIds(safeIds) : [];

    const result = await this.deleteFilesBulkUseCase.execute({
      ids: safeIds,
      companyId,
      extractionIds: safeExtractionIds,
      cascade,
    });

    if (filesToDelete.length > 0) {
      const fileService = new FileService(request.user.id);
      await Promise.all(
        filesToDelete.map(async (file) => {
          try {
            await fileService.deleteFile(file.url);
          } catch (error) {
            console.warn(`Failed to delete file from storage: ${file.url}`, error);
          }
        }),
      );
    }

    return response.status(200).json({
      status: 'success',
      message: `Deleted ${result.deletedFiles} files`,
      data: result,
    });
  }
}

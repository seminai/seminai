import { Request, Response } from 'express';
import { AddFieldNoteAttachmentUseCase } from '../../../application/use-cases/field-note/AddFieldNoteAttachmentUseCase';
import { CreateFieldNoteAttachmentDto } from '../../../domain/dtos/field-note.dto';
import { AppError } from '../../../domain/errors/AppError';
import { FileService } from '../../services/FileService';
import { MulterFile } from '../../services/Multer';
import { extractMarkdownWithMistralOCRFromUrl } from '../../services/ocr/mistral';
import { requireAuthenticatedUserId } from './controller-auth';

/** Handles field-note attachment upload and optional OCR context. */
export class FieldNoteAttachmentController {
  constructor(private readonly addAttachmentUseCase: AddFieldNoteAttachmentUseCase) {}

  async add(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const dto = request.body as Partial<CreateFieldNoteAttachmentDto>;
    const file = request.file as MulterFile | undefined;
    const metadata = this.parseMetadata(dto.metadata);
    const fileType = file?.mimetype ?? dto.fileType;
    const fileName = file?.originalname ?? dto.fileName;
    const fileSize = this.resolveFileSize(dto.fileSize, file);
    const fileUrl = await this.resolveFileUrl(userId, dto.fileUrl, file, fileType);
    const ocrContext =
      fileUrl && fileType ? await this.extractAttachmentContext(fileUrl, fileType) : undefined;
    if (!dto.fieldNoteId || !fileUrl || !fileName || !fileType || fileSize === null) {
      throw AppError.badRequest('Missing required attachment fields', 'MISSING_FIELDS');
    }
    const attachment = await this.addAttachmentUseCase.execute(userId, {
      fieldNoteId: dto.fieldNoteId,
      fileUrl,
      fileName,
      fileType,
      fileSize,
      thumbnailUrl: dto.thumbnailUrl,
      metadata: ocrContext ? { ...(metadata ?? {}), ...ocrContext } : metadata,
    });
    return response.status(201).json({ status: 'success', data: { attachment } });
  }

  private parseMetadata(metadata: unknown): Record<string, unknown> | undefined {
    if (!metadata) return undefined;
    if (typeof metadata === 'object') return metadata as Record<string, unknown>;
    if (typeof metadata !== 'string') return undefined;
    try {
      return JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }

  private resolveFileSize(fileSize: number | undefined, file?: MulterFile): number | null {
    if (file?.size !== undefined) return file.size;
    if (fileSize === undefined || fileSize === null) return null;
    const numericSize = Number(fileSize);
    return Number.isNaN(numericSize) ? null : numericSize;
  }

  private async resolveFileUrl(
    userId: string,
    fileUrl: string | undefined,
    file: MulterFile | undefined,
    fileType: string | undefined,
  ): Promise<string | undefined> {
    if (!file) return fileUrl;
    return new FileService(userId).uploadFile(
      file,
      userId,
      'field-note/attachments',
      fileType || file.mimetype,
    );
  }

  private async extractAttachmentContext(
    fileUrl: string,
    fileType: string,
  ): Promise<Record<string, unknown> | undefined> {
    if (!fileType.startsWith('image/') && fileType !== 'application/pdf') return undefined;
    try {
      const markdown = await extractMarkdownWithMistralOCRFromUrl(fileUrl);
      return markdown?.trim() ? { ocr: { provider: 'mistral', markdown } } : undefined;
    } catch {
      return undefined;
    }
  }
}

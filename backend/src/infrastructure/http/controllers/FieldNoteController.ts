import { Request, Response } from 'express';
import { FieldNoteCategory, FieldNoteProcessingStatus } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { CreateFieldNoteUseCase } from '../../../application/use-cases/field-note/CreateFieldNoteUseCase';
import { GetFieldNoteByIdUseCase } from '../../../application/use-cases/field-note/GetFieldNoteByIdUseCase';
import { ListFieldNotesByUserUseCase } from '../../../application/use-cases/field-note/ListFieldNotesByUserUseCase';
import { UpdateFieldNoteUseCase } from '../../../application/use-cases/field-note/UpdateFieldNoteUseCase';
import { DeleteFieldNoteUseCase } from '../../../application/use-cases/field-note/DeleteFieldNoteUseCase';
import { AddFieldNoteAttachmentUseCase } from '../../../application/use-cases/field-note/AddFieldNoteAttachmentUseCase';
import { GetFieldNoteStatsUseCase } from '../../../application/use-cases/field-note/GetFieldNoteStatsUseCase';
import {
  CreateFieldNoteDto,
  UpdateFieldNoteDto,
  CreateFieldNoteAttachmentDto,
  FieldNoteFiltersDto,
} from '../../../domain/dtos/field-note.dto';
import { FileService } from '../../services/FileService';
import { MulterFile } from '../../services/Multer';
import { extractMarkdownWithMistralOCRFromUrl } from '../../services/ocr/mistral';

export class FieldNoteController {
  private static readonly ATTACHMENT_UPLOAD_PATH = 'field-note/attachments';

  constructor(
    private readonly createFieldNoteUseCase: CreateFieldNoteUseCase,
    private readonly getFieldNoteByIdUseCase: GetFieldNoteByIdUseCase,
    private readonly listFieldNotesByUserUseCase: ListFieldNotesByUserUseCase,
    private readonly updateFieldNoteUseCase: UpdateFieldNoteUseCase,
    private readonly deleteFieldNoteUseCase: DeleteFieldNoteUseCase,
    private readonly addFieldNoteAttachmentUseCase: AddFieldNoteAttachmentUseCase,
    private readonly getFieldNoteStatsUseCase: GetFieldNoteStatsUseCase,
  ) {}

  async create(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const dto = request.body as CreateFieldNoteDto;

    if (!dto.category || !dto.rawContent) {
      throw AppError.badRequest('Category and rawContent are required', 'MISSING_REQUIRED_FIELDS');
    }

    const fieldNote = await this.createFieldNoteUseCase.execute(request.user.id, dto);

    return response.status(201).json({
      status: 'success',
      data: { fieldNote },
    });
  }

  async getById(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id } = request.params;

    if (!id) {
      throw AppError.badRequest('Field note ID is required', 'MISSING_ID');
    }

    const fieldNote = await this.getFieldNoteByIdUseCase.execute(id, request.user.id);

    return response.status(200).json({
      status: 'success',
      data: { fieldNote },
    });
  }

  async list(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const fieldNoteCategories = Object.values(FieldNoteCategory) as FieldNoteCategory[];
    const fieldNoteStatuses = Object.values(
      FieldNoteProcessingStatus,
    ) as FieldNoteProcessingStatus[];
    const filters: FieldNoteFiltersDto = {
      category: this.parseEnumValue(request.query.category, fieldNoteCategories),
      status: this.parseEnumValue(request.query.status, fieldNoteStatuses),
      fieldId: this.parseStringQuery(request.query.fieldId),
      productionUnitId: this.parseStringQuery(request.query.productionUnitId),
      productId: this.parseStringQuery(request.query.productId),
      startDate: this.parseDateQuery(request.query.startDate),
      endDate: this.parseDateQuery(request.query.endDate),
      hasLocation: this.parseBooleanQuery(request.query.hasLocation),
    };

    const fieldNotesWithRelations = await this.listFieldNotesByUserUseCase.executeWithRelations(
      request.user.id,
      filters,
    );

    const fieldNotes = fieldNotesWithRelations.map((fn) => {
      const company = fn.field?.company || fn.product?.warehouse?.company || null;

      // Show only the specifically associated field, not all fields from the production unit
      const field = fn.field
        ? {
            id: fn.field.id,
            name: fn.field.name,
          }
        : null;

      // Optionally include other fields from the production unit for context
      const relatedFields: Array<{ id: string; name: string }> = [];
      if (fn.productionUnit?.productionUnitsOnFields) {
        fn.productionUnit.productionUnitsOnFields.forEach(
          (puf: { field: { id: string; name: string } | null }) => {
            if (puf.field && puf.field.id !== fn.fieldId) {
              relatedFields.push({
                id: puf.field.id,
                name: puf.field.name,
              });
            }
          },
        );
      }

      return {
        id: fn.id,
        userId: fn.userId,
        category: fn.category,
        status: fn.status,
        rawContent: fn.rawContent,
        extractedData: fn.extractedData,
        latitude: fn.latitude,
        longitude: fn.longitude,
        altitude: fn.altitude,
        gpsAccuracy: fn.gpsAccuracy,
        conformityNotes: fn.conformityNotes,
        operationDate: fn.operationDate,
        fieldId: fn.fieldId,
        field, // Single field that was specifically associated
        relatedFields, // Other fields from the same production unit (for context)
        productionUnitId: fn.productionUnitId,
        productionUnit: fn.productionUnit
          ? {
              id: fn.productionUnit.id,
              name: fn.productionUnit.name,
            }
          : null,
        productId: fn.productId,
        product: fn.product
          ? {
              id: fn.product.id,
              name: fn.product.name,
              sku: fn.product.sku,
              category: fn.product.category,
              companyId: fn.product.warehouse?.companyId ?? null,
              company: fn.product.warehouse?.company
                ? {
                    id: fn.product.warehouse.company.id,
                    name: fn.product.warehouse.company.name,
                  }
                : null,
            }
          : null,
        company: company
          ? {
              id: company.id,
              name: company.name,
            }
          : null,
        jobId: fn.jobId,
        metadata: fn.metadata,
        aiConfidenceScore: fn.aiConfidenceScore,
        notes: fn.notes,
        attachments: (fn as Record<string, unknown>).attachments ?? [],
        createdAt: fn.createdAt,
        updatedAt: fn.updatedAt,
      };
    });

    return response.status(200).json({
      status: 'success',
      data: { fieldNotes, count: fieldNotes.length },
    });
  }

  async update(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id } = request.params;
    const dto = request.body as UpdateFieldNoteDto;

    if (!id) {
      throw AppError.badRequest('Field note ID is required', 'MISSING_ID');
    }

    const fieldNoteWithRelations = await this.updateFieldNoteUseCase.executeWithRelations(
      id,
      request.user.id,
      dto,
    );

    const company =
      fieldNoteWithRelations.field?.company ||
      fieldNoteWithRelations.product?.warehouse?.company ||
      null;

    // Show only the specifically associated field
    const field = fieldNoteWithRelations.field
      ? {
          id: fieldNoteWithRelations.field.id,
          name: fieldNoteWithRelations.field.name,
        }
      : null;

    // Optionally include other fields from the production unit for context
    const relatedFields: Array<{ id: string; name: string }> = [];
    if (fieldNoteWithRelations.productionUnit?.productionUnitsOnFields) {
      fieldNoteWithRelations.productionUnit.productionUnitsOnFields.forEach(
        (puf: { field: { id: string; name: string } | null }) => {
          const pufField = puf.field;
          if (pufField && pufField.id !== fieldNoteWithRelations.fieldId) {
            relatedFields.push({
              id: pufField.id,
              name: pufField.name,
            });
          }
        },
      );
    }

    const fieldNote = {
      id: fieldNoteWithRelations.id,
      userId: fieldNoteWithRelations.userId,
      category: fieldNoteWithRelations.category,
      status: fieldNoteWithRelations.status,
      rawContent: fieldNoteWithRelations.rawContent,
      extractedData: fieldNoteWithRelations.extractedData,
      latitude: fieldNoteWithRelations.latitude,
      longitude: fieldNoteWithRelations.longitude,
      altitude: fieldNoteWithRelations.altitude,
      gpsAccuracy: fieldNoteWithRelations.gpsAccuracy,
      conformityNotes: fieldNoteWithRelations.conformityNotes,
      operationDate: fieldNoteWithRelations.operationDate,
      fieldId: fieldNoteWithRelations.fieldId,
      field, // Single field that was specifically associated
      relatedFields, // Other fields from the same production unit (for context)
      productionUnitId: fieldNoteWithRelations.productionUnitId,
      productionUnit: fieldNoteWithRelations.productionUnit
        ? {
            id: fieldNoteWithRelations.productionUnit.id,
            name: fieldNoteWithRelations.productionUnit.name,
          }
        : null,
      productId: fieldNoteWithRelations.productId,
      product: fieldNoteWithRelations.product
        ? {
            id: fieldNoteWithRelations.product.id,
            name: fieldNoteWithRelations.product.name,
            sku: fieldNoteWithRelations.product.sku,
            category: fieldNoteWithRelations.product.category,
            companyId: fieldNoteWithRelations.product.warehouse?.companyId ?? null,
            company: fieldNoteWithRelations.product.warehouse?.company
              ? {
                  id: fieldNoteWithRelations.product.warehouse.company.id,
                  name: fieldNoteWithRelations.product.warehouse.company.name,
                }
              : null,
          }
        : null,
      company: company
        ? {
            id: company.id,
            name: company.name,
          }
        : null,
      jobId: fieldNoteWithRelations.jobId,
      metadata: fieldNoteWithRelations.metadata,
      aiConfidenceScore: fieldNoteWithRelations.aiConfidenceScore,
      notes: fieldNoteWithRelations.notes,
      createdAt: fieldNoteWithRelations.createdAt,
      updatedAt: fieldNoteWithRelations.updatedAt,
    };

    return response.status(200).json({
      status: 'success',
      data: { fieldNote },
    });
  }

  async delete(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id } = request.params;

    if (!id) {
      throw AppError.badRequest('Field note ID is required', 'MISSING_ID');
    }

    await this.deleteFieldNoteUseCase.execute(id, request.user.id);

    return response.status(200).json({
      status: 'success',
      message: 'Field note deleted successfully',
    });
  }

  async addAttachment(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const dto = request.body as Partial<CreateFieldNoteAttachmentDto>;
    const file = request.file as MulterFile | undefined;
    const metadata = this.parseMetadata(dto.metadata);
    const fileType = this.resolveFileType(dto.fileType, file);
    const fileName = this.resolveFileName(dto.fileName, file);
    const fileSize = this.resolveFileSize(dto.fileSize, file);
    const fileUrl = await this.resolveFileUrl(request.user.id, dto.fileUrl, file, fileType);
    const ocrContext =
      fileUrl && fileType ? await this.extractAttachmentContext(fileUrl, fileType) : undefined;
    const mergedMetadata = this.mergeMetadata(metadata, ocrContext);

    if (!dto.fieldNoteId || !fileUrl || !fileName || !fileType || fileSize === null) {
      throw AppError.badRequest('Missing required attachment fields', 'MISSING_FIELDS');
    }

    const attachment = await this.addFieldNoteAttachmentUseCase.execute(request.user.id, {
      fieldNoteId: dto.fieldNoteId,
      fileUrl,
      fileName,
      fileType,
      fileSize,
      thumbnailUrl: dto.thumbnailUrl,
      metadata: mergedMetadata,
    });

    return response.status(201).json({
      status: 'success',
      data: { attachment },
    });
  }

  async getStats(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const stats = await this.getFieldNoteStatsUseCase.execute(request.user.id);

    return response.status(200).json({
      status: 'success',
      data: { stats },
    });
  }

  private parseMetadata(metadata: unknown): Record<string, unknown> | undefined {
    if (!metadata) {
      return undefined;
    }
    if (typeof metadata === 'string') {
      try {
        const parsed = JSON.parse(metadata) as Record<string, unknown>;
        return parsed;
      } catch {
        return undefined;
      }
    }
    if (typeof metadata === 'object') {
      return metadata as Record<string, unknown>;
    }
    return undefined;
  }

  private resolveFileName(fileName: string | undefined, file?: MulterFile): string | undefined {
    if (file?.originalname) {
      return file.originalname;
    }
    return fileName;
  }

  private resolveFileType(fileType: string | undefined, file?: MulterFile): string | undefined {
    if (file?.mimetype) {
      return file.mimetype;
    }
    return fileType;
  }

  private resolveFileSize(fileSize: number | undefined, file?: MulterFile): number | null {
    if (file?.size !== undefined) {
      return file.size;
    }
    if (fileSize === undefined || fileSize === null) {
      return null;
    }
    const numericSize = Number(fileSize);
    if (Number.isNaN(numericSize)) {
      return null;
    }
    return numericSize;
  }

  private async resolveFileUrl(
    userId: string,
    fileUrl: string | undefined,
    file: MulterFile | undefined,
    fileType: string | undefined,
  ): Promise<string | undefined> {
    if (!file) {
      return fileUrl;
    }
    const type = fileType || file.mimetype;
    const fileService = new FileService(userId);
    return await fileService.uploadFile(
      file,
      userId,
      FieldNoteController.ATTACHMENT_UPLOAD_PATH,
      type,
    );
  }

  private async extractAttachmentContext(
    fileUrl: string,
    fileType: string,
  ): Promise<Record<string, unknown> | undefined> {
    const isSupported = fileType.startsWith('image/') || fileType === 'application/pdf';
    if (!isSupported) {
      return undefined;
    }
    try {
      const markdown = await extractMarkdownWithMistralOCRFromUrl(fileUrl);
      if (!markdown || markdown.trim().length === 0) {
        return undefined;
      }
      return {
        ocr: {
          provider: 'mistral',
          markdown,
        },
      };
    } catch {
      return undefined;
    }
  }

  private mergeMetadata(
    base: Record<string, unknown> | undefined,
    extra: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!base && !extra) {
      return undefined;
    }
    if (!extra) {
      return base;
    }
    return {
      ...(base ?? {}),
      ...extra,
    };
  }

  private parseEnumValue<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    return allowed.includes(trimmed as T) ? (trimmed as T) : undefined;
  }

  private parseStringQuery(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private parseDateQuery(value: unknown): Date | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private parseBooleanQuery(value: unknown): boolean | undefined {
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    return undefined;
  }
}

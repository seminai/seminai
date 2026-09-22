import { FieldNoteAttachment } from '../../../domain/entities/FieldNoteAttachment';
import { IFieldNoteRepository } from '../../../domain/repositories/IFieldNoteRepository';
import { AppError } from '../../../domain/errors/AppError';
import { CreateFieldNoteAttachmentDto } from '../../../domain/dtos/field-note.dto';
import { Prisma } from '@prisma/client';

export class AddFieldNoteAttachmentUseCase {
  constructor(private readonly fieldNoteRepository: IFieldNoteRepository) {}

  async execute(userId: string, dto: CreateFieldNoteAttachmentDto): Promise<FieldNoteAttachment> {
    const fieldNote = await this.fieldNoteRepository.findById(dto.fieldNoteId);

    if (!fieldNote) {
      throw AppError.notFound('Field note not found', 'FIELD_NOTE_NOT_FOUND');
    }

    if (fieldNote.userId !== userId) {
      throw AppError.forbidden(
        'You do not have permission to add attachments to this field note',
        'FORBIDDEN',
      );
    }

    const attachment = FieldNoteAttachment.create({
      fieldNoteId: dto.fieldNoteId,
      fileUrl: dto.fileUrl,
      fileName: dto.fileName,
      fileType: dto.fileType,
      fileSize: dto.fileSize,
      thumbnailUrl: dto.thumbnailUrl ?? null,
      metadata: (dto.metadata ?? null) as Prisma.JsonValue,
      aiAnalysis: null,
    });

    return await this.fieldNoteRepository.addAttachment(attachment);
  }
}

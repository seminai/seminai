import { FieldNote } from '../../../domain/entities/FieldNote';
import {
  IFieldNoteRepository,
  UpdateFieldNoteData,
} from '../../../domain/repositories/IFieldNoteRepository';
import { AppError } from '../../../domain/errors/AppError';
import { UpdateFieldNoteDto } from '../../../domain/dtos/field-note.dto';
import { Prisma } from '@prisma/client';

export class UpdateFieldNoteUseCase {
  constructor(private readonly fieldNoteRepository: IFieldNoteRepository) {}

  async execute(id: string, userId: string, dto: UpdateFieldNoteDto): Promise<FieldNote> {
    const existingFieldNote = await this.fieldNoteRepository.findById(id);

    if (!existingFieldNote) {
      throw AppError.notFound('Field note not found', 'FIELD_NOTE_NOT_FOUND');
    }

    if (existingFieldNote.userId !== userId) {
      throw AppError.forbidden('You do not have permission to update this field note', 'FORBIDDEN');
    }

    const updateData: UpdateFieldNoteData = {
      category: dto.category,
      rawContent: dto.rawContent,
      status: dto.status,
      fieldId: dto.fieldId,
      productionUnitId: dto.productionUnitId,
      productId: dto.productId,
      notes: dto.notes,
      extractedData: (dto.extractedData ?? undefined) as Prisma.JsonValue,
      aiConfidenceScore: dto.aiConfidenceScore,
      conformityNotes: (dto.conformityNotes ?? undefined) as Prisma.JsonValue,
    };

    return await this.fieldNoteRepository.update(id, updateData);
  }

  async executeWithRelations(
    id: string,
    userId: string,
    dto: UpdateFieldNoteDto,
  ): Promise<Awaited<ReturnType<IFieldNoteRepository['findByIdWithRelationsForResponse']>>> {
    await this.execute(id, userId, dto);
    const fieldNoteWithRelations =
      await this.fieldNoteRepository.findByIdWithRelationsForResponse(id);
    if (!fieldNoteWithRelations) {
      throw AppError.notFound('Field note not found', 'FIELD_NOTE_NOT_FOUND');
    }
    return fieldNoteWithRelations;
  }
}

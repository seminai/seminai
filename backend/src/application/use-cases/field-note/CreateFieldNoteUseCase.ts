import { FieldNote } from '../../../domain/entities/FieldNote';
import { IFieldNoteRepository } from '../../../domain/repositories/IFieldNoteRepository';
import { AppError } from '../../../domain/errors/AppError';
import { CreateFieldNoteDto } from '../../../domain/dtos/field-note.dto';
import { Prisma } from '@prisma/client';

export class CreateFieldNoteUseCase {
  constructor(private readonly fieldNoteRepository: IFieldNoteRepository) {}

  async execute(userId: string, dto: CreateFieldNoteDto): Promise<FieldNote> {
    if (!dto.category || !dto.rawContent) {
      throw AppError.badRequest('Category and rawContent are required', 'MISSING_FIELDS');
    }

    const fieldNote = FieldNote.create({
      userId,
      category: dto.category,
      status: 'PENDING',
      rawContent: dto.rawContent,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      altitude: dto.altitude ?? null,
      gpsAccuracy: dto.gpsAccuracy ?? null,
      conformityNotes: null,
      operationDate: dto.operationDate ?? new Date(),
      metadata: (dto.metadata ?? null) as Prisma.JsonValue,
      extractedData: null,
      fieldId: null,
      productionUnitId: null,
      productId: null,
      jobId: null,
      aiConfidenceScore: null,
      notes: null,
    });

    const createdFieldNote = await this.fieldNoteRepository.create(fieldNote);

    return createdFieldNote;
  }
}

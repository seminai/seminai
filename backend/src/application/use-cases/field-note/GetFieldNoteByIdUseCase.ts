import { FieldNote } from '../../../domain/entities/FieldNote';
import { IFieldNoteRepository } from '../../../domain/repositories/IFieldNoteRepository';
import { AppError } from '../../../domain/errors/AppError';

export class GetFieldNoteByIdUseCase {
  constructor(private readonly fieldNoteRepository: IFieldNoteRepository) {}

  async execute(id: string, userId: string): Promise<FieldNote> {
    const fieldNote = await this.fieldNoteRepository.findByIdWithRelations(id);

    if (!fieldNote) {
      throw AppError.notFound('Field note not found', 'FIELD_NOTE_NOT_FOUND');
    }

    if (fieldNote.userId !== userId) {
      throw AppError.forbidden('You do not have permission to access this field note', 'FORBIDDEN');
    }

    return fieldNote;
  }
}

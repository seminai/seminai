import { IFieldNoteRepository } from '../../../domain/repositories/IFieldNoteRepository';
import { AppError } from '../../../domain/errors/AppError';

export class DeleteFieldNoteUseCase {
  constructor(private readonly fieldNoteRepository: IFieldNoteRepository) {}

  async execute(id: string, userId: string): Promise<void> {
    const fieldNote = await this.fieldNoteRepository.findById(id);

    if (!fieldNote) {
      throw AppError.notFound('Field note not found', 'FIELD_NOTE_NOT_FOUND');
    }

    if (fieldNote.userId !== userId) {
      throw AppError.forbidden('You do not have permission to delete this field note', 'FORBIDDEN');
    }

    await this.fieldNoteRepository.delete(id);
  }
}

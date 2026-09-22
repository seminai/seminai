import { FieldNote } from '../../../domain/entities/FieldNote';
import {
  IFieldNoteRepository,
  FindFieldNotesFilters,
} from '../../../domain/repositories/IFieldNoteRepository';

export class ListFieldNotesByUserUseCase {
  constructor(private readonly fieldNoteRepository: IFieldNoteRepository) {}

  async execute(userId: string, filters?: FindFieldNotesFilters): Promise<FieldNote[]> {
    const searchFilters: FindFieldNotesFilters = {
      ...filters,
      userId,
    };

    return await this.fieldNoteRepository.findAll(searchFilters);
  }

  async executeWithRelations(
    userId: string,
    filters?: FindFieldNotesFilters,
  ): Promise<Awaited<ReturnType<IFieldNoteRepository['findAllWithRelations']>>> {
    const searchFilters: FindFieldNotesFilters = {
      ...filters,
      userId,
    };

    return await this.fieldNoteRepository.findAllWithRelations(searchFilters);
  }
}

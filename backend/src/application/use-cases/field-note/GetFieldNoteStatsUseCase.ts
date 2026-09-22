import { IFieldNoteRepository } from '../../../domain/repositories/IFieldNoteRepository';

export interface FieldNoteStatsDto {
  totalNotes: number;
  byStatus: Record<string, number>;
}

export class GetFieldNoteStatsUseCase {
  constructor(private readonly fieldNoteRepository: IFieldNoteRepository) {}

  async execute(userId: string): Promise<FieldNoteStatsDto> {
    const byStatus = await this.fieldNoteRepository.countByStatus(userId);

    const totalNotes = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

    return {
      totalNotes,
      byStatus,
    };
  }
}

import { PrismaClient } from '@prisma/client';
import { PrismaFieldNoteRepository } from '../../repositories/PrismaFieldNoteRepository';
import {
  GetFieldNoteStatsUseCase,
  FieldNoteStatsDto,
} from '../../../application/use-cases/field-note/GetFieldNoteStatsUseCase';

/**
 * Returns total count of field notes for a user plus breakdown by processing status.
 * Read-only, no approval required.
 */
export async function countUserFieldNotes(params: {
  userId: string;
  prisma: PrismaClient;
}): Promise<FieldNoteStatsDto> {
  const { userId, prisma } = params;

  try {
    const repository = new PrismaFieldNoteRepository(prisma);
    const useCase = new GetFieldNoteStatsUseCase(repository);
    return await useCase.execute(userId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to count user field notes: ${errorMessage}`);
  }
}

import { FieldNote } from '../../domain/entities/FieldNote';
import type { PrismaFieldNoteRepositoryContext } from './prisma-field-note-repository.context';

export async function prismaFieldNoteRepositoryFindPendingProcessing(this: PrismaFieldNoteRepositoryContext): Promise<FieldNote[]> {
    const fieldNotes = await this.prisma.fieldNote.findMany({
      where: {
        status: 'PENDING',
      },
      orderBy: { createdAt: 'asc' },
    });
    return fieldNotes.map(FieldNote.fromPrisma);
  }

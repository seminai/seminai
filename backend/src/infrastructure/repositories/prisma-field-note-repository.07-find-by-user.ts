import { FieldNote } from '../../domain/entities/FieldNote';
import type { PrismaFieldNoteRepositoryContext } from './prisma-field-note-repository.context';

export async function prismaFieldNoteRepositoryFindByUser(this: PrismaFieldNoteRepositoryContext, userId: string): Promise<FieldNote[]> {
    const fieldNotes = await this.prisma.fieldNote.findMany({
      where: { userId },
      orderBy: { operationDate: 'desc' },
    });
    return fieldNotes.map(FieldNote.fromPrisma);
  }

import { FieldNote } from '../../domain/entities/FieldNote';
import type { PrismaFieldNoteRepositoryContext } from './prisma-field-note-repository.context';

export async function prismaFieldNoteRepositoryFindById(this: PrismaFieldNoteRepositoryContext, id: string): Promise<FieldNote | null> {
    const fieldNote = await this.prisma.fieldNote.findUnique({
      where: { id },
    });
    if (!fieldNote) return null;
    return FieldNote.fromPrisma(fieldNote);
  }

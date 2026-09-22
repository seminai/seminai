import type { PrismaFieldNoteRepositoryContext } from './prisma-field-note-repository.context';

export async function prismaFieldNoteRepositoryDelete(this: PrismaFieldNoteRepositoryContext, id: string): Promise<void> {
    await this.prisma.fieldNote.delete({
      where: { id },
    });
  }

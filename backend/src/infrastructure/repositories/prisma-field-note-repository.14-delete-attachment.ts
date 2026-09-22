import type { PrismaFieldNoteRepositoryContext } from './prisma-field-note-repository.context';

export async function prismaFieldNoteRepositoryDeleteAttachment(this: PrismaFieldNoteRepositoryContext, attachmentId: string): Promise<void> {
    await this.prisma.fieldNoteAttachment.delete({
      where: { id: attachmentId },
    });
  }

import { FieldNoteAttachment } from '../../domain/entities/FieldNoteAttachment';
import type { PrismaFieldNoteRepositoryContext } from './prisma-field-note-repository.context';

export async function prismaFieldNoteRepositoryFindAttachmentsByFieldNoteId(this: PrismaFieldNoteRepositoryContext, fieldNoteId: string): Promise<FieldNoteAttachment[]> {
    const attachments = await this.prisma.fieldNoteAttachment.findMany({
      where: { fieldNoteId },
      orderBy: { createdAt: 'asc' },
    });
    return attachments.map(FieldNoteAttachment.fromPrisma);
  }

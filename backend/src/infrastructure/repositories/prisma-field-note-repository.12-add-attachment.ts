import { Prisma } from '@prisma/client';
import { FieldNoteAttachment } from '../../domain/entities/FieldNoteAttachment';
import type { PrismaFieldNoteRepositoryContext } from './prisma-field-note-repository.context';

export async function prismaFieldNoteRepositoryAddAttachment(this: PrismaFieldNoteRepositoryContext, attachment: FieldNoteAttachment): Promise<FieldNoteAttachment> {
    const created = await this.prisma.fieldNoteAttachment.create({
      data: {
        id: attachment.id,
        fieldNoteId: attachment.fieldNoteId,
        fileUrl: attachment.fileUrl,
        fileName: attachment.fileName,
        fileType: attachment.fileType,
        fileSize: attachment.fileSize,
        thumbnailUrl: attachment.thumbnailUrl,
        metadata: attachment.metadata as Prisma.InputJsonValue,
        aiAnalysis: attachment.aiAnalysis as Prisma.InputJsonValue,
        createdAt: attachment.createdAt,
      },
    });
    return FieldNoteAttachment.fromPrisma(created);
  }

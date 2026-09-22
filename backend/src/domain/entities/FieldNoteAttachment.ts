import { randomUUID } from 'node:crypto';
import { FieldNoteAttachment as PrismaFieldNoteAttachment, Prisma } from '@prisma/client';

/**
 * FieldNoteAttachment domain entity representing an attachment of a field note.
 */
export class FieldNoteAttachment {
  constructor(
    public readonly id: string,
    public readonly fieldNoteId: string,
    public readonly fileUrl: string,
    public readonly fileName: string,
    public readonly fileType: string,
    public readonly fileSize: number,
    public readonly thumbnailUrl: string | null,
    public readonly metadata: Prisma.JsonValue | null,
    public readonly aiAnalysis: Prisma.JsonValue | null,
    public readonly createdAt: Date,
  ) {}

  /**
   * Factory method to create a new FieldNoteAttachment.
   */
  static create(props: Omit<PrismaFieldNoteAttachment, 'id' | 'createdAt'>): FieldNoteAttachment {
    return new FieldNoteAttachment(
      randomUUID(),
      props.fieldNoteId,
      props.fileUrl,
      props.fileName,
      props.fileType,
      props.fileSize,
      props.thumbnailUrl ?? null,
      props.metadata ?? null,
      props.aiAnalysis ?? null,
      new Date(),
    );
  }

  /**
   * Build from Prisma record.
   */
  static fromPrisma(prisma: PrismaFieldNoteAttachment): FieldNoteAttachment {
    return new FieldNoteAttachment(
      prisma.id,
      prisma.fieldNoteId,
      prisma.fileUrl,
      prisma.fileName,
      prisma.fileType,
      prisma.fileSize,
      prisma.thumbnailUrl,
      prisma.metadata,
      prisma.aiAnalysis,
      prisma.createdAt,
    );
  }

  /**
   * Check if the attachment is an image.
   */
  isImage(): boolean {
    return this.fileType.startsWith('image/');
  }
}

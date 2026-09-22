import { randomUUID } from 'node:crypto';
import {
  FieldNote as PrismaFieldNote,
  FieldNoteCategory,
  FieldNoteProcessingStatus,
  Prisma,
} from '@prisma/client';

/**
 * FieldNote domain entity representing a field note created by a user.
 */
export class FieldNote {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly category: FieldNoteCategory,
    public readonly status: FieldNoteProcessingStatus,
    public readonly rawContent: string,
    public readonly extractedData: Prisma.JsonValue | null,
    public readonly latitude: number | null,
    public readonly longitude: number | null,
    public readonly altitude: number | null,
    public readonly gpsAccuracy: number | null,
    public readonly conformityNotes: Prisma.JsonValue | null,
    public readonly operationDate: Date,
    public readonly fieldId: string | null,
    public readonly productionUnitId: string | null,
    public readonly productId: string | null,
    public readonly jobId: string | null,
    public readonly metadata: Prisma.JsonValue | null,
    public readonly aiConfidenceScore: number | null,
    public readonly notes: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  /**
   * Factory method to create a new FieldNote with generated id and timestamps.
   */
  static create(props: Omit<PrismaFieldNote, 'id' | 'createdAt' | 'updatedAt'>): FieldNote {
    return new FieldNote(
      randomUUID(),
      props.userId,
      props.category,
      props.status ?? 'PENDING',
      props.rawContent,
      props.extractedData ?? null,
      props.latitude ?? null,
      props.longitude ?? null,
      props.altitude ?? null,
      props.gpsAccuracy ?? null,
      props.conformityNotes ?? null,
      props.operationDate ?? new Date(),
      props.fieldId ?? null,
      props.productionUnitId ?? null,
      props.productId ?? null,
      props.jobId ?? null,
      props.metadata ?? null,
      props.aiConfidenceScore ?? null,
      props.notes ?? null,
      new Date(),
      new Date(),
    );
  }

  /**
   * Build a FieldNote from Prisma record.
   */
  static fromPrisma(prismaFieldNote: PrismaFieldNote): FieldNote {
    return new FieldNote(
      prismaFieldNote.id,
      prismaFieldNote.userId,
      prismaFieldNote.category,
      prismaFieldNote.status,
      prismaFieldNote.rawContent,
      prismaFieldNote.extractedData,
      prismaFieldNote.latitude,
      prismaFieldNote.longitude,
      prismaFieldNote.altitude,
      prismaFieldNote.gpsAccuracy,
      prismaFieldNote.conformityNotes,
      prismaFieldNote.operationDate,
      prismaFieldNote.fieldId,
      prismaFieldNote.productionUnitId,
      prismaFieldNote.productId,
      prismaFieldNote.jobId,
      prismaFieldNote.metadata,
      prismaFieldNote.aiConfidenceScore,
      prismaFieldNote.notes,
      prismaFieldNote.createdAt,
      prismaFieldNote.updatedAt,
    );
  }

  /**
   * Check if the field note has been successfully processed.
   */
  isProcessed(): boolean {
    return this.status === 'PROCESSED' || this.status === 'MANUALLY_REVIEWED';
  }

  /**
   * Check if the field note has high confidence AI recognition.
   */
  hasHighConfidence(): boolean {
    return this.aiConfidenceScore !== null && this.aiConfidenceScore >= 0.8;
  }

  /**
   * Check if the field note needs manual review.
   */
  needsManualReview(): boolean {
    return this.status === 'FAILED' || (this.status === 'PROCESSED' && !this.hasHighConfidence());
  }
}

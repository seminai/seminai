import { Prisma } from '@prisma/client';
import { FieldNote } from '../../domain/entities/FieldNote';
import type { PrismaFieldNoteRepositoryContext } from './prisma-field-note-repository.context';

export async function prismaFieldNoteRepositoryCreate(this: PrismaFieldNoteRepositoryContext, fieldNote: FieldNote): Promise<FieldNote> {
    const created = await this.prisma.fieldNote.create({
      data: {
        id: fieldNote.id,
        userId: fieldNote.userId,
        category: fieldNote.category,
        status: fieldNote.status,
        rawContent: fieldNote.rawContent,
        extractedData: fieldNote.extractedData as Prisma.InputJsonValue,
        latitude: fieldNote.latitude,
        longitude: fieldNote.longitude,
        altitude: fieldNote.altitude,
        gpsAccuracy: fieldNote.gpsAccuracy,
        conformityNotes: fieldNote.conformityNotes as Prisma.InputJsonValue,
        operationDate: fieldNote.operationDate,
        fieldId: fieldNote.fieldId,
        productionUnitId: fieldNote.productionUnitId,
        productId: fieldNote.productId,
        jobId: fieldNote.jobId,
        metadata: fieldNote.metadata as Prisma.InputJsonValue,
        aiConfidenceScore: fieldNote.aiConfidenceScore,
        notes: fieldNote.notes,
        createdAt: fieldNote.createdAt,
        updatedAt: fieldNote.updatedAt,
      },
    });
    return FieldNote.fromPrisma(created);
  }

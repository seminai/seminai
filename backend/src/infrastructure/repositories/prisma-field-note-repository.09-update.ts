import { Prisma } from '@prisma/client';
import { FieldNote } from '../../domain/entities/FieldNote';
import { UpdateFieldNoteData } from '../../domain/repositories/IFieldNoteRepository';
import type { PrismaFieldNoteRepositoryContext } from './prisma-field-note-repository.context';

export async function prismaFieldNoteRepositoryUpdate(this: PrismaFieldNoteRepositoryContext, id: string, data: UpdateFieldNoteData): Promise<FieldNote> {
    const updated = await this.prisma.fieldNote.update({
      where: { id },
      data: {
        category: data.category,
        status: data.status,
        rawContent: data.rawContent,
        extractedData: data.extractedData as Prisma.InputJsonValue,
        latitude: data.latitude,
        longitude: data.longitude,
        altitude: data.altitude,
        gpsAccuracy: data.gpsAccuracy,
        conformityNotes: data.conformityNotes as Prisma.InputJsonValue,
        operationDate: data.operationDate,
        fieldId: data.fieldId,
        productionUnitId: data.productionUnitId,
        productId: data.productId,
        jobId: data.jobId,
        metadata: data.metadata as Prisma.InputJsonValue,
        aiConfidenceScore: data.aiConfidenceScore,
        notes: data.notes,
        updatedAt: new Date(),
      },
    });
    return FieldNote.fromPrisma(updated);
  }

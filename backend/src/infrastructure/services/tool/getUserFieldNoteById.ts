import { PrismaClient, FieldNoteCategory, FieldNoteProcessingStatus } from '@prisma/client';
import { PrismaFieldNoteRepository } from '../../repositories/PrismaFieldNoteRepository';

export interface FieldNoteDetail {
  id: string;
  operationDate: string;
  createdAt: string;
  category: FieldNoteCategory;
  status: FieldNoteProcessingStatus;
  rawContent: string;
  extractedData: unknown;
  companyId: string | null;
  companyName: string | null;
  fieldId: string | null;
  fieldName: string | null;
  productionUnitId: string | null;
  productionUnitName: string | null;
  productId: string | null;
  productName: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  hasLocation: boolean;
  attachmentsCount: number;
}

/**
 * Retrieves full detail of a single field note, verifying it belongs to the caller.
 * Returns null if the note does not exist or belongs to another user.
 */
export async function getUserFieldNoteById(params: {
  userId: string;
  fieldNoteId: string;
  prisma: PrismaClient;
}): Promise<FieldNoteDetail | null> {
  const { userId, fieldNoteId, prisma } = params;

  try {
    const repository = new PrismaFieldNoteRepository(prisma);
    const result = await repository.findByIdWithRelationsForResponse(fieldNoteId);

    if (!result) {
      return null;
    }
    if (result.userId !== userId) {
      return null;
    }

    const attachments = await repository.findAttachmentsByFieldNoteId(fieldNoteId);

    return {
      id: result.id,
      operationDate: result.operationDate.toISOString(),
      createdAt: result.createdAt.toISOString(),
      category: result.category,
      status: result.status,
      rawContent: result.rawContent,
      extractedData: result.extractedData,
      companyId: result.field?.company?.id ?? null,
      companyName: result.field?.company?.name ?? null,
      fieldId: result.fieldId,
      fieldName: result.field?.name ?? null,
      productionUnitId: result.productionUnitId,
      productionUnitName: result.productionUnit?.name ?? null,
      productId: result.productId,
      productName: result.product?.name ?? null,
      latitude: result.latitude,
      longitude: result.longitude,
      altitude: result.altitude,
      hasLocation: result.latitude !== null && result.longitude !== null,
      attachmentsCount: attachments.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to get field note: ${errorMessage}`);
  }
}

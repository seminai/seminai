import { FieldNoteWithRelations } from '../../../domain/repositories/IFieldNoteRepository';

export const toFieldNoteResponse = (fieldNote: FieldNoteWithRelations) => {
  const company = fieldNote.field?.company || fieldNote.product?.warehouse?.company || null;
  const relatedFields =
    fieldNote.productionUnit?.productionUnitsOnFields
      .filter((relation) => relation.field && relation.field.id !== fieldNote.fieldId)
      .map((relation) => ({ id: relation.field!.id, name: relation.field!.name })) ?? [];
  return {
    id: fieldNote.id,
    userId: fieldNote.userId,
    category: fieldNote.category,
    status: fieldNote.status,
    rawContent: fieldNote.rawContent,
    extractedData: fieldNote.extractedData,
    latitude: fieldNote.latitude,
    longitude: fieldNote.longitude,
    altitude: fieldNote.altitude,
    gpsAccuracy: fieldNote.gpsAccuracy,
    conformityNotes: fieldNote.conformityNotes,
    operationDate: fieldNote.operationDate,
    fieldId: fieldNote.fieldId,
    field: fieldNote.field ? { id: fieldNote.field.id, name: fieldNote.field.name } : null,
    relatedFields,
    productionUnitId: fieldNote.productionUnitId,
    productionUnit: fieldNote.productionUnit
      ? { id: fieldNote.productionUnit.id, name: fieldNote.productionUnit.name }
      : null,
    productId: fieldNote.productId,
    product: fieldNote.product
      ? {
          id: fieldNote.product.id,
          name: fieldNote.product.name,
          sku: fieldNote.product.sku,
          category: fieldNote.product.category,
          companyId: fieldNote.product.warehouse?.companyId ?? null,
          company: fieldNote.product.warehouse?.company
            ? {
                id: fieldNote.product.warehouse.company.id,
                name: fieldNote.product.warehouse.company.name,
              }
            : null,
        }
      : null,
    company: company ? { id: company.id, name: company.name } : null,
    jobId: fieldNote.jobId,
    metadata: fieldNote.metadata,
    aiConfidenceScore: fieldNote.aiConfidenceScore,
    notes: fieldNote.notes,
    attachments: (fieldNote as Record<string, unknown>).attachments ?? [],
    createdAt: fieldNote.createdAt,
    updatedAt: fieldNote.updatedAt,
  };
};

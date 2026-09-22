import { FieldNote } from '../entities/FieldNote';
import { FieldNoteAttachment } from '../entities/FieldNoteAttachment';
import { FieldNoteCategory, FieldNoteProcessingStatus, Prisma } from '@prisma/client';

export interface FindFieldNotesFilters {
  userId?: string;
  category?: FieldNoteCategory;
  status?: FieldNoteProcessingStatus;
  fieldId?: string;
  productionUnitId?: string;
  productId?: string;
  startDate?: Date;
  endDate?: Date;
  hasLocation?: boolean;
}

export interface UpdateFieldNoteData {
  category?: FieldNoteCategory;
  status?: FieldNoteProcessingStatus;
  rawContent?: string;
  extractedData?: Prisma.JsonValue;
  latitude?: number | null;
  longitude?: number | null;
  altitude?: number | null;
  gpsAccuracy?: number | null;
  conformityNotes?: Prisma.JsonValue;
  operationDate?: Date;
  fieldId?: string | null;
  productionUnitId?: string | null;
  productId?: string | null;
  jobId?: string | null;
  metadata?: Prisma.JsonValue;
  aiConfidenceScore?: number | null;
  notes?: string | null;
}

export type FieldNoteWithRelations = Prisma.FieldNoteGetPayload<{
  include: {
    field: { include: { company: { select: { id: true; name: true } } } };
    product: {
      include: { warehouse: { include: { company: { select: { id: true; name: true } } } } };
    };
    productionUnit: {
      include: {
        productionUnitsOnFields: { include: { field: { select: { id: true; name: true } } } };
      };
    };
  };
}>;

export interface IFieldNoteRepository {
  create(fieldNote: FieldNote): Promise<FieldNote>;

  findById(id: string): Promise<FieldNote | null>;

  findByIdWithRelations(id: string): Promise<FieldNote | null>;

  findByIdWithRelationsForResponse(id: string): Promise<FieldNoteWithRelations | null>;

  findAll(filters: FindFieldNotesFilters): Promise<FieldNote[]>;

  findAllWithRelations(filters: FindFieldNotesFilters): Promise<FieldNoteWithRelations[]>;

  findByUser(userId: string): Promise<FieldNote[]>;

  findPendingProcessing(): Promise<FieldNote[]>;

  update(id: string, data: UpdateFieldNoteData): Promise<FieldNote>;

  delete(id: string): Promise<void>;

  /** Deletes every field note linked to the given company via field, production unit, or product/warehouse. */
  deleteAllByCompanyId(companyId: string): Promise<number>;

  addAttachment(attachment: FieldNoteAttachment): Promise<FieldNoteAttachment>;

  findAttachmentsByFieldNoteId(fieldNoteId: string): Promise<FieldNoteAttachment[]>;

  deleteAttachment(attachmentId: string): Promise<void>;

  countByStatus(userId: string): Promise<Record<FieldNoteProcessingStatus, number>>;

  findNearbyFieldNotes(
    latitude: number,
    longitude: number,
    radiusMeters: number,
  ): Promise<FieldNote[]>;
}

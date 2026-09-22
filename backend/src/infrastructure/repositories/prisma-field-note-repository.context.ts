import { PrismaClient } from '@prisma/client';
import { FieldNote } from '../../domain/entities/FieldNote';
import { FieldNoteAttachment } from '../../domain/entities/FieldNoteAttachment';
import { FindFieldNotesFilters, UpdateFieldNoteData, FieldNoteWithRelations } from '../../domain/repositories/IFieldNoteRepository';

export interface PrismaFieldNoteRepositoryContext {
  readonly prisma: PrismaClient;
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
  deleteAllByCompanyId(companyId: string): Promise<number>;
  addAttachment(attachment: FieldNoteAttachment): Promise<FieldNoteAttachment>;
  findAttachmentsByFieldNoteId(fieldNoteId: string): Promise<FieldNoteAttachment[]>;
  deleteAttachment(attachmentId: string): Promise<void>;
  countByStatus(userId: string): Promise<Record<string, number>>;
  findNearbyFieldNotes(latitude: number, longitude: number, radiusMeters: number): Promise<FieldNote[]>;
}

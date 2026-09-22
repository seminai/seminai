import { PrismaClient } from '@prisma/client';
import { FieldNote } from '../../domain/entities/FieldNote';
import { FieldNoteAttachment } from '../../domain/entities/FieldNoteAttachment';
import { IFieldNoteRepository, FindFieldNotesFilters, UpdateFieldNoteData, FieldNoteWithRelations } from '../../domain/repositories/IFieldNoteRepository';
import type { PrismaFieldNoteRepositoryContext } from './prisma-field-note-repository.context';
import { prismaFieldNoteRepositoryCreate } from './prisma-field-note-repository.01-create';
import { prismaFieldNoteRepositoryFindById } from './prisma-field-note-repository.02-find-by-id';
import { prismaFieldNoteRepositoryFindByIdWithRelations } from './prisma-field-note-repository.03-find-by-id-with-relations';
import { prismaFieldNoteRepositoryFindByIdWithRelationsForResponse } from './prisma-field-note-repository.04-find-by-id-with-relations-for-response';
import { prismaFieldNoteRepositoryFindAll } from './prisma-field-note-repository.05-find-all';
import { prismaFieldNoteRepositoryFindAllWithRelations } from './prisma-field-note-repository.06-find-all-with-relations';
import { prismaFieldNoteRepositoryFindByUser } from './prisma-field-note-repository.07-find-by-user';
import { prismaFieldNoteRepositoryFindPendingProcessing } from './prisma-field-note-repository.08-find-pending-processing';
import { prismaFieldNoteRepositoryUpdate } from './prisma-field-note-repository.09-update';
import { prismaFieldNoteRepositoryDelete } from './prisma-field-note-repository.10-delete';
import { prismaFieldNoteRepositoryDeleteAllByCompanyId } from './prisma-field-note-repository.11-delete-all-by-company-id';
import { prismaFieldNoteRepositoryAddAttachment } from './prisma-field-note-repository.12-add-attachment';
import { prismaFieldNoteRepositoryFindAttachmentsByFieldNoteId } from './prisma-field-note-repository.13-find-attachments-by-field-note-id';
import { prismaFieldNoteRepositoryDeleteAttachment } from './prisma-field-note-repository.14-delete-attachment';
import { prismaFieldNoteRepositoryCountByStatus } from './prisma-field-note-repository.15-count-by-status';
import { prismaFieldNoteRepositoryFindNearbyFieldNotes } from './prisma-field-note-repository.16-find-nearby-field-notes';


export class PrismaFieldNoteRepository implements IFieldNoteRepository {

  constructor(readonly prisma: PrismaClient) {}

  async create(fieldNote: FieldNote): Promise<FieldNote> {
    return prismaFieldNoteRepositoryCreate.call(this as unknown as PrismaFieldNoteRepositoryContext, fieldNote);
  }

  async findById(id: string): Promise<FieldNote | null> {
    return prismaFieldNoteRepositoryFindById.call(this as unknown as PrismaFieldNoteRepositoryContext, id);
  }

  async findByIdWithRelations(id: string): Promise<FieldNote | null> {
    return prismaFieldNoteRepositoryFindByIdWithRelations.call(this as unknown as PrismaFieldNoteRepositoryContext, id);
  }

  async findByIdWithRelationsForResponse(id: string): Promise<FieldNoteWithRelations | null> {
    return prismaFieldNoteRepositoryFindByIdWithRelationsForResponse.call(this as unknown as PrismaFieldNoteRepositoryContext, id);
  }

  async findAll(filters: FindFieldNotesFilters): Promise<FieldNote[]> {
    return prismaFieldNoteRepositoryFindAll.call(this as unknown as PrismaFieldNoteRepositoryContext, filters);
  }

  async findAllWithRelations(filters: FindFieldNotesFilters): Promise<FieldNoteWithRelations[]> {
    return prismaFieldNoteRepositoryFindAllWithRelations.call(this as unknown as PrismaFieldNoteRepositoryContext, filters);
  }

  async findByUser(userId: string): Promise<FieldNote[]> {
    return prismaFieldNoteRepositoryFindByUser.call(this as unknown as PrismaFieldNoteRepositoryContext, userId);
  }

  async findPendingProcessing(): Promise<FieldNote[]> {
    return prismaFieldNoteRepositoryFindPendingProcessing.call(this as unknown as PrismaFieldNoteRepositoryContext);
  }

  async update(id: string, data: UpdateFieldNoteData): Promise<FieldNote> {
    return prismaFieldNoteRepositoryUpdate.call(this as unknown as PrismaFieldNoteRepositoryContext, id, data);
  }

  async delete(id: string): Promise<void> {
    return prismaFieldNoteRepositoryDelete.call(this as unknown as PrismaFieldNoteRepositoryContext, id);
  }

  async deleteAllByCompanyId(companyId: string): Promise<number> {
    return prismaFieldNoteRepositoryDeleteAllByCompanyId.call(this as unknown as PrismaFieldNoteRepositoryContext, companyId);
  }

  async addAttachment(attachment: FieldNoteAttachment): Promise<FieldNoteAttachment> {
    return prismaFieldNoteRepositoryAddAttachment.call(this as unknown as PrismaFieldNoteRepositoryContext, attachment);
  }

  async findAttachmentsByFieldNoteId(fieldNoteId: string): Promise<FieldNoteAttachment[]> {
    return prismaFieldNoteRepositoryFindAttachmentsByFieldNoteId.call(this as unknown as PrismaFieldNoteRepositoryContext, fieldNoteId);
  }

  async deleteAttachment(attachmentId: string): Promise<void> {
    return prismaFieldNoteRepositoryDeleteAttachment.call(this as unknown as PrismaFieldNoteRepositoryContext, attachmentId);
  }

  async countByStatus(userId: string): Promise<Record<string, number>> {
    return prismaFieldNoteRepositoryCountByStatus.call(this as unknown as PrismaFieldNoteRepositoryContext, userId);
  }

  async findNearbyFieldNotes(
    latitude: number,
    longitude: number,
    radiusMeters: number,
  ): Promise<FieldNote[]> {
    return prismaFieldNoteRepositoryFindNearbyFieldNotes.call(this as unknown as PrismaFieldNoteRepositoryContext, latitude, longitude, radiusMeters);
  }
}

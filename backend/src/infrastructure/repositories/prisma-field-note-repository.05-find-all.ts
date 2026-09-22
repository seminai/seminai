import { Prisma } from '@prisma/client';
import { FieldNote } from '../../domain/entities/FieldNote';
import { FindFieldNotesFilters } from '../../domain/repositories/IFieldNoteRepository';
import type { PrismaFieldNoteRepositoryContext } from './prisma-field-note-repository.context';

export async function prismaFieldNoteRepositoryFindAll(this: PrismaFieldNoteRepositoryContext, filters: FindFieldNotesFilters): Promise<FieldNote[]> {
    const where: Prisma.FieldNoteWhereInput = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.category) {
      where.category = filters.category;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.fieldId) {
      where.fieldId = filters.fieldId;
    }
    if (filters.productionUnitId) {
      where.productionUnitId = filters.productionUnitId;
    }
    if (filters.productId) {
      where.productId = filters.productId;
    }
    if (filters.startDate || filters.endDate) {
      where.operationDate = {};
      if (filters.startDate) {
        where.operationDate.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.operationDate.lte = filters.endDate;
      }
    }
    if (filters.hasLocation !== undefined) {
      if (filters.hasLocation) {
        where.AND = [{ latitude: { not: null } }, { longitude: { not: null } }];
      } else {
        where.OR = [{ latitude: null }, { longitude: null }];
      }
    }

    const fieldNotes = await this.prisma.fieldNote.findMany({
      where,
      include: {
        field: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        product: {
          include: {
            warehouse: {
              include: {
                company: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        productionUnit: true,
        attachments: {
          select: {
            id: true,
            fileUrl: true,
            fileName: true,
            fileType: true,
            thumbnailUrl: true,
          },
        },
      },
      orderBy: { operationDate: 'desc' },
    });

    return fieldNotes.map((fn) => FieldNote.fromPrisma(fn));
  }

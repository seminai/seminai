import { FieldNoteWithRelations } from '../../domain/repositories/IFieldNoteRepository';
import type { PrismaFieldNoteRepositoryContext } from './prisma-field-note-repository.context';

export async function prismaFieldNoteRepositoryFindByIdWithRelationsForResponse(this: PrismaFieldNoteRepositoryContext, id: string): Promise<FieldNoteWithRelations | null> {
    const fieldNote = await this.prisma.fieldNote.findUnique({
      where: { id },
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
        productionUnit: {
          include: {
            productionUnitsOnFields: {
              include: {
                field: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    return fieldNote;
  }

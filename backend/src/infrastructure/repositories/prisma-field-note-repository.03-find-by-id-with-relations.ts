import { FieldNote } from '../../domain/entities/FieldNote';
import type { PrismaFieldNoteRepositoryContext } from './prisma-field-note-repository.context';

export async function prismaFieldNoteRepositoryFindByIdWithRelations(this: PrismaFieldNoteRepositoryContext, id: string): Promise<FieldNote | null> {
    const fieldNote = await this.prisma.fieldNote.findUnique({
      where: { id },
      include: {
        user: true,
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
        productionUnit: true,
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
        job: true,
        attachments: true,
      },
    });
    if (!fieldNote) return null;
    return FieldNote.fromPrisma(fieldNote);
  }

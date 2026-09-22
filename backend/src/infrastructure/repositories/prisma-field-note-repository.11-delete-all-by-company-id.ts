import type { PrismaFieldNoteRepositoryContext } from './prisma-field-note-repository.context';

export async function prismaFieldNoteRepositoryDeleteAllByCompanyId(this: PrismaFieldNoteRepositoryContext, companyId: string): Promise<number> {
    const result = await this.prisma.fieldNote.deleteMany({
      where: {
        OR: [
          { field: { companyId } },
          {
            productionUnit: {
              productionUnitsOnFields: { some: { field: { companyId } } },
            },
          },
          { product: { warehouse: { companyId } } },
        ],
      },
    });
    return result.count;
  }

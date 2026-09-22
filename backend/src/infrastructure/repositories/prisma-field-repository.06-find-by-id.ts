import { Field } from '../../domain/entities/Field';
import type { PrismaFieldRepositoryContext } from './prisma-field-repository.context';

export async function prismaFieldRepositoryFindById(this: PrismaFieldRepositoryContext, id: string): Promise<Field | null> {
    const found = await this.prisma.field.findUnique({
      where: { id },
      include: {
        productionUnitsOnFields: {
          include: {
            productionUnit: {
              include: {
                cycles: {
                  orderBy: [
                    { seasonYear: 'desc' },
                    { cycleIndex: 'desc' },
                    { harvestingDate: 'desc' },
                  ],
                  take: 1,
                },
              },
            },
          },
        },
        company: { select: { name: true } },
        sourceFile: true,
      },
    });
    if (!found) return null;
    return Field.fromPrismaWithRelations(found);
  }

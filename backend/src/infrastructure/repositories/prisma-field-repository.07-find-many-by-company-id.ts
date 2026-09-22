import { Field } from '../../domain/entities/Field';
import type { PrismaFieldRepositoryContext } from './prisma-field-repository.context';

export async function prismaFieldRepositoryFindManyByCompanyId(this: PrismaFieldRepositoryContext, companyId: string): Promise<Field[]> {
    const list = await this.prisma.field.findMany({
      where: { companyId },
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
    return list.map(Field.fromPrismaWithRelations);
  }

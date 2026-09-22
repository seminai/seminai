import { Field } from '../../domain/entities/Field';
import type { PrismaFieldRepositoryContext } from './prisma-field-repository.context';

export async function prismaFieldRepositoryFindManyByUserId(this: PrismaFieldRepositoryContext, userId: string): Promise<Field[]> {
    const userCompanies = await this.prisma.userOnCompany.findMany({
      where: { userId },
      select: { companyId: true },
    });
    const companyIds = userCompanies.map((uc) => uc.companyId);
    if (companyIds.length === 0) return [];

    const list = await this.prisma.field.findMany({
      where: { companyId: { in: companyIds } },
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

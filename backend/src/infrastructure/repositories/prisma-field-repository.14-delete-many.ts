import type { PrismaFieldRepositoryContext } from './prisma-field-repository.context';

export async function prismaFieldRepositoryDeleteMany(this: PrismaFieldRepositoryContext, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.productionUnitOnField.deleteMany({
        where: {
          fieldId: { in: ids },
        },
      });
      await tx.field.deleteMany({
        where: {
          id: { in: ids },
        },
      });
    });
  }

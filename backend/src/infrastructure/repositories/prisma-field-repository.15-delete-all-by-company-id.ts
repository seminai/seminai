import type { PrismaFieldRepositoryContext } from './prisma-field-repository.context';

export async function prismaFieldRepositoryDeleteAllByCompanyId(this: PrismaFieldRepositoryContext, companyId: string): Promise<number> {
    const fields = await this.prisma.field.findMany({
      where: { companyId },
      select: { id: true },
    });
    const ids = fields.map((f) => f.id);
    if (ids.length === 0) return 0;
    await this.deleteMany(ids);
    return ids.length;
  }

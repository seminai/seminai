import type { PrismaFieldRepositoryContext } from './prisma-field-repository.context';

export async function prismaFieldRepositoryDelete(this: PrismaFieldRepositoryContext, id: string): Promise<void> {
    await this.prisma.field.delete({ where: { id } });
  }

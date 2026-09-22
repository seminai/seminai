import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositoryDelete(this: PrismaProductionUnitRepositoryContext, id: string): Promise<void> {
    await this.prisma.productionUnit.delete({ where: { id } });
  }

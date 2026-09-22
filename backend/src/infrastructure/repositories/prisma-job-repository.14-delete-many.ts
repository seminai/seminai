import type { PrismaJobRepositoryContext } from './prisma-job-repository.context';

export async function prismaJobRepositoryDeleteMany(this: PrismaJobRepositoryContext, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.job.deleteMany({ where: { id: { in: ids } } });
  }

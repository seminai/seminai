import type { PrismaJobRepositoryContext } from './prisma-job-repository.context';

export async function prismaJobRepositoryDelete(this: PrismaJobRepositoryContext, id: string): Promise<void> {
    await this.prisma.job.delete({ where: { id } });
  }

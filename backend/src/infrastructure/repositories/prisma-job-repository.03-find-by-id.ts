import { Job } from '../../domain/entities/Job';
import type { PrismaJobRepositoryContext } from './prisma-job-repository.context';

export async function prismaJobRepositoryFindById(this: PrismaJobRepositoryContext, id: string): Promise<Job | null> {
    const found = await this.prisma.job.findUnique({ where: { id } });
    return found ? Job.fromPrisma(found) : null;
  }

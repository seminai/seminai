import { Job } from '../../domain/entities/Job';
import type { PrismaJobRepositoryContext } from './prisma-job-repository.context';

export async function prismaJobRepositoryFindAll(this: PrismaJobRepositoryContext): Promise<Job[]> {
    const list = await this.prisma.job.findMany();
    return list.map(Job.fromPrisma);
  }

import { Job } from '../../domain/entities/Job';
import type { PrismaJobRepositoryContext } from './prisma-job-repository.context';

export async function prismaJobRepositoryFindManyByProductionUnitId(this: PrismaJobRepositoryContext, productionUnitId: string): Promise<Job[]> {
    const list = await this.prisma.job.findMany({ where: { productionUnitId } });
    return list.map(Job.fromPrisma);
  }

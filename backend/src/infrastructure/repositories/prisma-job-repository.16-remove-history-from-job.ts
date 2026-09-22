import { Job } from '../../domain/entities/Job';
import { JobWithoutHistory } from '../../domain/dtos/job-assignment.dto';
import type { PrismaJobRepositoryContext } from './prisma-job-repository.context';

export function prismaJobRepositoryRemoveHistoryFromJob(this: PrismaJobRepositoryContext, job: Job): JobWithoutHistory {
    const { history: _history, ...jobWithoutHistory } = job;
    void _history;
    return jobWithoutHistory as JobWithoutHistory;
  }

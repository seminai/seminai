import { PrismaClient } from '@prisma/client';
import { Job } from '../../domain/entities/Job';
import { JobWithAssignmentDTO, JobWithAssignmentWithoutHistoryDTO, JobWithoutHistory } from '../../domain/dtos/job-assignment.dto';
import { JobGroupSummaryDTO } from '../../domain/dtos/job-group-summary.dto';
import { JobProductLinkDTO } from '../../domain/dtos/job-product-link.dto';

export interface PrismaJobRepositoryContext {
  readonly prisma: PrismaClient;
  create(job: Job): Promise<Job>;
  createMany(jobs: Job[]): Promise<void>;
  findById(id: string): Promise<Job | null>;
  findAll(): Promise<Job[]>;
  findManyByProductionUnitId(productionUnitId: string): Promise<Job[]>;
  findManyByUserIdWithAssignment(userId: string, companyName?: string, jobId?: string): Promise<JobWithAssignmentDTO[]>;
  findManyByUserIdWithAssignmentWithoutHistory(userId: string, companyName?: string, jobId?: string): Promise<JobWithAssignmentWithoutHistoryDTO[]>;
  findUnverifiedJobsByUserIdWithAssignment(userId: string, companyName?: string, jobGroupId?: string): Promise<JobWithAssignmentWithoutHistoryDTO[]>;
  findVerifiedJobsByUserIdWithAssignment(userId: string, companyName?: string, skip?: number, take?: number): Promise<{ jobs: JobWithAssignmentDTO[]; total: number }>;
  findManyByIdsWithProducts(jobIds: string[]): Promise<JobProductLinkDTO[]>;
  findManyByIdsWithCompany(ids: string[]): Promise<Array<{ job: Job; companyId: string | null }>>;
  update(id: string, data: Partial<Job>): Promise<Job>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
  findJobGroupsSummaryByUserId(userId: string): Promise<JobGroupSummaryDTO[]>;
  removeHistoryFromJob(job: Job): JobWithoutHistory;
}

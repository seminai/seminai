import {
  PrismaClient,
  DosageAgentJob as PrismaDosageAgentJob,
  DosageAgentJobState as PrismaDosageAgentJobState,
  Prisma,
} from '@prisma/client';
import { DosageAgentJob, DosageAgentJobState } from '../../domain/entities/DosageAgentJob';
import {
  IDosageAgentJobRepository,
  UpdateDosageAgentJobStatusInput,
} from '../../domain/repositories/IDosageAgentJobRepository';
import { withRetry } from './Prisma';

const DEFAULT_LIST_LIMIT = 50;

export class PrismaDosageAgentJobRepository implements IDosageAgentJobRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(job: DosageAgentJob): Promise<DosageAgentJob> {
    const saved = await this.prisma.dosageAgentJob.create({
      data: {
        id: job.id,
        userId: job.userId,
        state: this.mapStateToPrisma(job.state),
        progress: job.progress,
        failedReason: job.failedReason ?? null,
        processedOn: job.processedOn ?? null,
        finishedOn: job.finishedOn ?? null,
        name: job.name ?? null,
      },
    });

    return this.toDomain(saved);
  }

  async updateStatus(input: UpdateDosageAgentJobStatusInput): Promise<DosageAgentJob | null> {
    const updateData: {
      state?: PrismaDosageAgentJobState;
      progress?: number;
      failedReason?: string | null;
      processedOn?: Date | null;
      finishedOn?: Date | null;
      userId?: string;
      name?: string | null;
    } = {};

    if (input.state) {
      updateData.state = this.mapStateToPrisma(input.state);
    }
    if (input.progress !== undefined) {
      updateData.progress = input.progress;
    }
    if (input.failedReason !== undefined) {
      updateData.failedReason = input.failedReason;
    }
    if (input.processedOn !== undefined) {
      updateData.processedOn = input.processedOn;
    }
    if (input.finishedOn !== undefined) {
      updateData.finishedOn = input.finishedOn;
    }
    if (input.userId !== undefined) {
      updateData.userId = input.userId;
    }
    if (input.name !== undefined) {
      updateData.name = input.name;
    }

    // IMPORTANT: avoid race conditions by using an atomic upsert when userId is available.
    // When userId is not provided, we only allow updates (and fail if the record does not exist).
    if (input.userId) {
      // TypeScript narrowing: capture userId as a constant string
      const userId: string = input.userId;
      try {
        const result = await withRetry(() =>
          this.prisma.dosageAgentJob.upsert({
            where: { id: input.jobId },
            update: updateData,
            create: {
              id: input.jobId,
              userId,
              state: this.mapStateToPrisma(input.state ?? DosageAgentJobState.QUEUED),
              progress: input.progress ?? 0,
              failedReason: input.failedReason ?? null,
              processedOn: input.processedOn ?? null,
              finishedOn: input.finishedOn ?? null,
              name: input.name ?? null,
            },
          }),
        );
        return this.toDomain(result);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          // Fallback: if a concurrent create won the race and we got a unique
          // violation, retry as a plain update.
          if (error.code === 'P2002') {
            try {
              const result = await withRetry(() =>
                this.prisma.dosageAgentJob.update({
                  where: { id: input.jobId },
                  data: updateData,
                }),
              );
              return this.toDomain(result);
            } catch (updateError) {
              if (
                updateError instanceof Prisma.PrismaClientKnownRequestError &&
                (updateError.code === 'P2003' || updateError.code === 'P2025')
              ) {
                console.warn(
                  `[REPO] Skip DosageAgentJob upsert fallback update for job=${input.jobId} user=${userId}: ${updateError.code}`,
                );
                return null;
              }
              throw updateError;
            }
          }
          // Orphan userId — user does not exist. Never block the worker.
          if (error.code === 'P2003') {
            console.warn(
              `[REPO] Skip DosageAgentJob upsert: FK violation for user=${userId} job=${input.jobId}`,
            );
            return null;
          }
        }
        throw error;
      }
    }

    try {
      const result = await withRetry(() =>
        this.prisma.dosageAgentJob.update({
          where: { id: input.jobId },
          data: updateData,
        }),
      );
      return this.toDomain(result);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          console.warn(
            `[REPO] Skip DosageAgentJob update: row not found for job=${input.jobId} and userId is missing`,
          );
          return null;
        }
        if (error.code === 'P2003') {
          console.warn(`[REPO] Skip DosageAgentJob update: FK violation for job=${input.jobId}`);
          return null;
        }
      }
      throw error;
    }
  }

  async findById(jobId: string): Promise<DosageAgentJob | null> {
    const found = await this.prisma.dosageAgentJob.findUnique({
      where: { id: jobId },
    });
    return found ? this.toDomain(found) : null;
  }

  async findByIdAndUser(jobId: string, userId: string): Promise<DosageAgentJob | null> {
    const found = await this.prisma.dosageAgentJob.findFirst({
      where: { id: jobId, userId },
    });
    return found ? this.toDomain(found) : null;
  }

  async findByUser(userId: string, limit?: number): Promise<DosageAgentJob[]> {
    const jobs = await this.prisma.dosageAgentJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit ?? DEFAULT_LIST_LIMIT,
    });
    return jobs.map((job) => this.toDomain(job));
  }

  async deleteByIdAndUser(jobId: string, userId: string): Promise<void> {
    await this.prisma.dosageAgentJob.deleteMany({
      where: { id: jobId, userId },
    });
  }

  private toDomain(prismaJob: PrismaDosageAgentJob): DosageAgentJob {
    return new DosageAgentJob(
      prismaJob.id,
      prismaJob.userId,
      this.mapStateToDomain(prismaJob.state),
      prismaJob.progress,
      prismaJob.failedReason ?? undefined,
      prismaJob.processedOn ?? undefined,
      prismaJob.finishedOn ?? undefined,
      prismaJob.createdAt,
      prismaJob.updatedAt,
      prismaJob.name ?? undefined,
    );
  }

  private mapStateToDomain(state: PrismaDosageAgentJobState): DosageAgentJobState {
    switch (state) {
      case 'QUEUED':
        return DosageAgentJobState.QUEUED;
      case 'WAITING':
        return DosageAgentJobState.WAITING;
      case 'ACTIVE':
        return DosageAgentJobState.ACTIVE;
      case 'COMPLETED':
        return DosageAgentJobState.COMPLETED;
      case 'FAILED':
        return DosageAgentJobState.FAILED;
      case 'STALLED':
        return DosageAgentJobState.STALLED;
      case 'DELAYED':
        return DosageAgentJobState.DELAYED;
      case 'NOT_FOUND':
      default:
        return DosageAgentJobState.NOT_FOUND;
    }
  }

  private mapStateToPrisma(state: DosageAgentJobState): PrismaDosageAgentJobState {
    switch (state) {
      case DosageAgentJobState.QUEUED:
        return PrismaDosageAgentJobState.QUEUED;
      case DosageAgentJobState.WAITING:
        return PrismaDosageAgentJobState.WAITING;
      case DosageAgentJobState.ACTIVE:
        return PrismaDosageAgentJobState.ACTIVE;
      case DosageAgentJobState.COMPLETED:
        return PrismaDosageAgentJobState.COMPLETED;
      case DosageAgentJobState.FAILED:
        return PrismaDosageAgentJobState.FAILED;
      case DosageAgentJobState.STALLED:
        return PrismaDosageAgentJobState.STALLED;
      case DosageAgentJobState.DELAYED:
        return PrismaDosageAgentJobState.DELAYED;
      case DosageAgentJobState.NOT_FOUND:
      default:
        return PrismaDosageAgentJobState.NOT_FOUND;
    }
  }
}

import {
  ProductJobCreationQueue,
  ProductJobCreationJobResult,
} from '../../../infrastructure/queue/ProductJobCreationQueue';
import { IDosageAgentJobRepository } from '../../../domain/repositories/IDosageAgentJobRepository';

export interface GetProductJobCreationStatusInput {
  readonly jobId: string;
  readonly userId: string;
}

export interface GetProductJobCreationStatusOutput {
  readonly id: string;
  readonly state: string;
  readonly progress: number;
  readonly result?: ProductJobCreationJobResult;
  readonly failedReason?: string;
  readonly processedOn?: Date;
  readonly finishedOn?: Date;
  readonly stopPolling?: boolean;
  readonly message?: string;
}

function notFound(jobId: string): GetProductJobCreationStatusOutput {
  return {
    id: jobId,
    state: 'not_found',
    progress: 0,
    stopPolling: true,
    message: 'Job not found or has been removed. Stop polling.',
  };
}

/**
 * Returns product-job creation status only for jobs owned by the caller.
 */
export class GetProductJobCreationStatusUseCase {
  constructor(
    private readonly productJobCreationQueue: ProductJobCreationQueue,
    private readonly dosageAgentJobRepository: IDosageAgentJobRepository,
  ) {}

  async execute(
    input: GetProductJobCreationStatusInput,
  ): Promise<GetProductJobCreationStatusOutput> {
    try {
      const queueStatus = await this.productJobCreationQueue.getJobStatus(input.jobId);
      if (!queueStatus.data?.userId || queueStatus.data.userId !== input.userId) {
        return notFound(input.jobId);
      }
      return {
        id: queueStatus.id,
        state: queueStatus.state,
        progress: queueStatus.progress,
        result: queueStatus.result,
        failedReason: queueStatus.failedReason,
        processedOn: queueStatus.processedOn ? new Date(queueStatus.processedOn) : undefined,
        finishedOn: queueStatus.finishedOn ? new Date(queueStatus.finishedOn) : undefined,
      };
    } catch {
      try {
        const dbJob = await this.dosageAgentJobRepository.findByIdAndUser(
          input.jobId,
          input.userId,
        );
        if (dbJob) {
          return {
            id: dbJob.id,
            state: dbJob.state,
            progress: dbJob.progress,
            failedReason: dbJob.failedReason,
            processedOn: dbJob.processedOn,
            finishedOn: dbJob.finishedOn,
          };
        }
      } catch {
        // Ignore DB errors and fall through to the not-found response.
      }
      return notFound(input.jobId);
    }
  }
}

import { ConformityCheckerQueue } from '../../../infrastructure/queue/ConformityCheckerQueue';
import { IDosageAgentJobRepository } from '../../../domain/repositories/IDosageAgentJobRepository';
import type { ConformityCheckOutput } from '../../../infrastructure/services/agents/conformity_checker_agent/types';

/**
 * Input per ottenere lo stato di un job
 */
export interface GetConformityCheckJobStatusInput {
  readonly jobId: string;
}

/**
 * Output con lo stato del job
 */
export interface GetConformityCheckJobStatusOutput {
  readonly id: string;
  readonly state: string;
  readonly progress: number;
  readonly data?: {
    readonly jobGroupId: string;
    readonly userId: string;
    readonly notes?: string;
  };
  readonly result?: ConformityCheckOutput;
  readonly failedReason?: string;
  readonly processedOn?: Date;
  readonly finishedOn?: Date;
  readonly stopPolling?: boolean;
  readonly message?: string;
}

/**
 * Use case per ottenere lo stato di un job di controllo conformità
 */
export class GetConformityCheckJobStatusUseCase {
  constructor(
    private readonly conformityCheckerQueue: ConformityCheckerQueue,
    private readonly dosageAgentJobRepository: IDosageAgentJobRepository,
  ) {}

  async execute(
    input: GetConformityCheckJobStatusInput,
  ): Promise<GetConformityCheckJobStatusOutput> {
    // Prima prova a ottenere lo stato dalla coda Redis
    try {
      const queueStatus = await this.conformityCheckerQueue.getJobStatus(input.jobId);
      return {
        id: queueStatus.id,
        state: queueStatus.state,
        progress: queueStatus.progress,
        data: queueStatus.data,
        result: queueStatus.result,
        failedReason: queueStatus.failedReason,
        processedOn: queueStatus.processedOn ? new Date(queueStatus.processedOn) : undefined,
        finishedOn: queueStatus.finishedOn ? new Date(queueStatus.finishedOn) : undefined,
      };
    } catch (queueError) {
      // Se non è nella coda Redis, prova dal database
      try {
        const dbJob = await this.dosageAgentJobRepository.findById(input.jobId);
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
        // Ignora errori DB
      }

      // Job non trovato
      return {
        id: input.jobId,
        state: 'not_found',
        progress: 0,
        stopPolling: true,
        message: 'Job not found or has been removed. Stop polling.',
      };
    }
  }
}

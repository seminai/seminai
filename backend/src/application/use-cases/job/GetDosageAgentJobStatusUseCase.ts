import { DosageAgentQueue } from '../../../infrastructure/queue/DosageAgentQueue';
import {
  UnitAllowedProductsOutput,
  UnitAllowedProductsWithDosageOutput,
} from '../../../infrastructure/services/agents/dosage_agent/flowMatchCropTreatment';
import { StockBalanceReport } from '../../../infrastructure/services/agents/dosage_agent/flowMatchProductionUnitTreatmentDosage';
import { DosageAgentJob, DosageAgentJobState } from '../../../domain/entities/DosageAgentJob';
import { IDosageAgentJobRepository } from '../../../domain/repositories/IDosageAgentJobRepository';

/**
 * Input for getting dosage agent job status
 */
export interface GetDosageAgentJobStatusInput {
  readonly jobId: string;
}

/**
 * Output of getting dosage agent job status
 */
export interface GetDosageAgentJobStatusOutput {
  readonly id: string;
  readonly state: string;
  readonly progress: number;
  readonly data?: {
    productsCount: number;
    unitsCount: number;
    unitsProcessed?: number;
    userId: string;
  };
  readonly result?: {
    outcome: ReadonlyArray<UnitAllowedProductsOutput>;
    outcomeWithDosage: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
    stockBalance: StockBalanceReport;
  };
  readonly failedReason?: string;
  readonly processedOn?: number;
  readonly finishedOn?: number;
}

/**
 * Use case for getting dosage agent job status
 */
export class GetDosageAgentJobStatusUseCase {
  constructor(
    private readonly dosageAgentQueue: DosageAgentQueue,
    private readonly dosageAgentJobRepository: IDosageAgentJobRepository,
  ) {}

  async execute(input: GetDosageAgentJobStatusInput): Promise<GetDosageAgentJobStatusOutput> {
    let status: GetDosageAgentJobStatusOutput;
    try {
      status = await this.dosageAgentQueue.getJobStatus(input.jobId);
    } catch (err) {
      if (this.isJobNotFoundError(err)) {
        const persisted = await this.dosageAgentJobRepository.findById(input.jobId);
        if (persisted) return this.buildStatusFromPersistedJob(persisted);
      }
      throw err;
    }

    const mappedState = this.mapQueueState(status.state);
    const progress = Number.isFinite(status.progress) ? status.progress : 0;
    const processedOnDate = status.processedOn ? new Date(status.processedOn) : null;
    const finishedOnDate = status.finishedOn ? new Date(status.finishedOn) : null;

    await this.dosageAgentJobRepository.updateStatus({
      jobId: status.id,
      userId: status.data?.userId,
      state: mappedState,
      progress,
      failedReason: status.failedReason ?? null,
      processedOn: processedOnDate,
      finishedOn: finishedOnDate,
    });

    return status;
  }

  private isJobNotFoundError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    return /Job .* not found/i.test(err.message);
  }

  private buildStatusFromPersistedJob(job: DosageAgentJob): GetDosageAgentJobStatusOutput {
    return {
      id: job.id,
      state: job.state,
      progress: job.progress,
      failedReason: job.failedReason,
      processedOn: job.processedOn?.getTime(),
      finishedOn: job.finishedOn?.getTime(),
    };
  }

  private mapQueueState(state: string): DosageAgentJobState {
    switch (state) {
      case 'active':
        return DosageAgentJobState.ACTIVE;
      case 'completed':
        return DosageAgentJobState.COMPLETED;
      case 'failed':
        return DosageAgentJobState.FAILED;
      case 'stalled':
        return DosageAgentJobState.STALLED;
      case 'delayed':
        return DosageAgentJobState.DELAYED;
      case 'waiting':
        return DosageAgentJobState.WAITING;
      case 'not_found':
        return DosageAgentJobState.NOT_FOUND;
      case 'queued':
      default:
        return DosageAgentJobState.QUEUED;
    }
  }
}

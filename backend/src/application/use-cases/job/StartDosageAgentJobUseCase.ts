import {
  DosageAgentQueue,
  DosageAgentJobData,
} from '../../../infrastructure/queue/DosageAgentQueue';
import { InputDosageAgent } from '../../../infrastructure/services/agents/dosage_agent';
import { DosageAgentJobState } from '../../../domain/entities/DosageAgentJob';
import { IDosageAgentJobRepository } from '../../../domain/repositories/IDosageAgentJobRepository';

/**
 * Input for starting a dosage agent job
 */
export interface StartDosageAgentJobInput {
  readonly input: InputDosageAgent;
  readonly userId: string;
}

/**
 * Output of starting a dosage agent job
 */
export interface StartDosageAgentJobOutput {
  readonly jobId: string;
}

/**
 * Use case for starting a dosage agent job asynchronously
 */
export class StartDosageAgentJobUseCase {
  constructor(
    private readonly dosageAgentQueue: DosageAgentQueue,
    private readonly dosageAgentJobRepository: IDosageAgentJobRepository,
  ) {}

  async execute(input: StartDosageAgentJobInput): Promise<StartDosageAgentJobOutput> {
    const jobData: DosageAgentJobData = {
      input: input.input,
      userId: input.userId,
    };

    const jobId = await this.dosageAgentQueue.addJob(jobData);

    await this.dosageAgentJobRepository.updateStatus({
      jobId,
      userId: input.userId,
      state: DosageAgentJobState.QUEUED,
      progress: 0,
      failedReason: null,
    });

    return {
      jobId,
    };
  }
}

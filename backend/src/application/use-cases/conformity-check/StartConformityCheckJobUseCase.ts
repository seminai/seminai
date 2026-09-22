import {
  ConformityCheckerQueue,
  ConformityCheckerJobData,
} from '../../../infrastructure/queue/ConformityCheckerQueue';
import type { ConformityCheckInput } from '../../../infrastructure/services/agents/conformity_checker_agent/types';
import { DosageAgentJobState } from '../../../domain/entities/DosageAgentJob';
import { IDosageAgentJobRepository } from '../../../domain/repositories/IDosageAgentJobRepository';

/**
 * Input per avviare un job di controllo conformità
 */
export interface StartConformityCheckJobInput {
  readonly input: ConformityCheckInput;
  readonly userId: string;
}

/**
 * Output dell'avvio del job
 */
export interface StartConformityCheckJobOutput {
  readonly jobId: string;
}

/**
 * Use case per avviare un job di controllo conformità in modo asincrono
 */
export class StartConformityCheckJobUseCase {
  constructor(
    private readonly conformityCheckerQueue: ConformityCheckerQueue,
    private readonly dosageAgentJobRepository: IDosageAgentJobRepository,
  ) {}

  async execute(input: StartConformityCheckJobInput): Promise<StartConformityCheckJobOutput> {
    const jobData: ConformityCheckerJobData = {
      input: input.input,
      userId: input.userId,
    };

    const jobId = await this.conformityCheckerQueue.addJob(jobData);

    await this.dosageAgentJobRepository.updateStatus({
      jobId,
      userId: input.userId,
      state: DosageAgentJobState.QUEUED,
      progress: 0,
      failedReason: null,
      name: `Controllo Conformità - ${input.input.jobGroupId}`,
    });

    return {
      jobId,
    };
  }
}

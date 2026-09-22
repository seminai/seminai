import { DosageAgentJob } from '../../../domain/entities/DosageAgentJob';
import { AppError } from '../../../domain/errors/AppError';
import { IDosageAgentJobRepository } from '../../../domain/repositories/IDosageAgentJobRepository';

export interface GetDosageAgentJobInput {
  readonly jobId: string;
  readonly userId: string;
}

/**
 * Retrieves a dosage agent job for the authenticated user.
 */
export class GetDosageAgentJobUseCase {
  constructor(private readonly dosageAgentJobRepository: IDosageAgentJobRepository) {}

  async execute(input: GetDosageAgentJobInput): Promise<DosageAgentJob> {
    const job = await this.dosageAgentJobRepository.findByIdAndUser(input.jobId, input.userId);

    if (!job) {
      throw AppError.notFound('Job not found', 'DOSAGE_JOB_NOT_FOUND');
    }

    return job;
  }
}

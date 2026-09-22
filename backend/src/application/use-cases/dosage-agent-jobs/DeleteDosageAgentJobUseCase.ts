import { AppError } from '../../../domain/errors/AppError';
import { IDosageAgentJobRepository } from '../../../domain/repositories/IDosageAgentJobRepository';

export interface DeleteDosageAgentJobInput {
  readonly jobId: string;
  readonly userId: string;
}

/**
 * Deletes a dosage agent job owned by the authenticated user.
 */
export class DeleteDosageAgentJobUseCase {
  constructor(private readonly dosageAgentJobRepository: IDosageAgentJobRepository) {}

  async execute(input: DeleteDosageAgentJobInput): Promise<void> {
    const existing = await this.dosageAgentJobRepository.findByIdAndUser(input.jobId, input.userId);

    if (!existing) {
      throw AppError.notFound('Job not found', 'DOSAGE_JOB_NOT_FOUND');
    }

    await this.dosageAgentJobRepository.deleteByIdAndUser(input.jobId, input.userId);
  }
}

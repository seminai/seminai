import { DosageAgentJob } from '../../../domain/entities/DosageAgentJob';
import { IDosageAgentJobRepository } from '../../../domain/repositories/IDosageAgentJobRepository';

export interface ListDosageAgentJobsInput {
  readonly userId: string;
  readonly limit?: number;
}

/**
 * Lists dosage agent jobs for the authenticated user.
 */
export class ListDosageAgentJobsUseCase {
  constructor(private readonly dosageAgentJobRepository: IDosageAgentJobRepository) {}

  async execute(input: ListDosageAgentJobsInput): Promise<DosageAgentJob[]> {
    const limit = input.limit ?? 50;
    return await this.dosageAgentJobRepository.findByUser(input.userId, limit);
  }
}

/**
 * Represents a dosage agent job persisted for auditing and listing purposes.
 */
export enum DosageAgentJobState {
  QUEUED = 'queued',
  WAITING = 'waiting',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  STALLED = 'stalled',
  DELAYED = 'delayed',
  NOT_FOUND = 'not_found',
}

export class DosageAgentJob {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly state: DosageAgentJobState,
    public readonly progress: number,
    public readonly failedReason?: string,
    public readonly processedOn?: Date,
    public readonly finishedOn?: Date,
    public readonly createdAt?: Date,
    public readonly updatedAt?: Date,
    public readonly name?: string,
  ) {}
}

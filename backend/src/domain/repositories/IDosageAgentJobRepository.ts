import { DosageAgentJob, DosageAgentJobState } from '../entities/DosageAgentJob';

export interface UpdateDosageAgentJobStatusInput {
  readonly jobId: string;
  readonly state?: DosageAgentJobState;
  readonly progress?: number;
  readonly failedReason?: string | null;
  readonly processedOn?: Date | null;
  readonly finishedOn?: Date | null;
  readonly userId?: string;
  readonly name?: string | null;
}

export interface IDosageAgentJobRepository {
  create(job: DosageAgentJob): Promise<DosageAgentJob>;
  /**
   * Persist the job status. Returns `null` when persistence is skipped
   * because a foreign-key constraint (typically an orphan `userId`) would
   * otherwise fail. Callers must tolerate the `null` return and continue
   * processing so a missing user never blocks the worker.
   */
  updateStatus(input: UpdateDosageAgentJobStatusInput): Promise<DosageAgentJob | null>;
  findById(jobId: string): Promise<DosageAgentJob | null>;
  findByIdAndUser(jobId: string, userId: string): Promise<DosageAgentJob | null>;
  findByUser(userId: string, limit?: number): Promise<DosageAgentJob[]>;
  deleteByIdAndUser(jobId: string, userId: string): Promise<void>;
}

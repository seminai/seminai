import { Job } from '../entities/Job';

/**
 * DTO representing a Job enriched with its production unit, related fields, and company context.
 */
export interface JobWithAssignmentDTO {
  readonly job: Job;
  readonly productionUnit: {
    readonly id: string;
    readonly name: string;
    readonly cropName: string;
    readonly cropType: string;
    readonly sauHa: number;
  };
  readonly products: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly registrationNumber: string | null;
  }>;
  readonly fields: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
  readonly company: {
    readonly id: string;
    readonly name: string;
  };
  readonly machine: {
    readonly id: string;
    readonly name: string;
    readonly identifier: string;
    readonly lastPositiveRevisionDate: Date | null;
  } | null;
  readonly dosageAgentJobName?: string | null;
}

export type JobWithoutHistory = Omit<Job, 'history'>;

export interface JobWithAssignmentWithoutHistoryDTO {
  readonly job: JobWithoutHistory;
  readonly productionUnit: {
    readonly id: string;
    readonly name: string;
    readonly cropName: string;
    readonly cropType: string;
    readonly sauHa: number;
  };
  readonly products: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly registrationNumber: string | null;
  }>;
  readonly fields: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
  readonly company: {
    readonly id: string;
    readonly name: string;
  };
  readonly machine: {
    readonly id: string;
    readonly name: string;
    readonly identifier: string;
    readonly lastPositiveRevisionDate: Date | null;
  } | null;
  readonly dosageAgentJobName?: string | null;
}

import { Job } from '../entities/Job';

/**
 * Represents a Job collection grouped by a shared jobId.
 */
export interface JobGroupDTO {
  readonly jobId: string;
  readonly jobs: ReadonlyArray<Job>;
}

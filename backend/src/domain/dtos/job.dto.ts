import { Job } from '../entities/Job';

/**
 * Mapped type representing the updatable properties of a Job.
 */
export type UpdatableJobProps = Partial<Omit<Job, 'id' | 'createdAt' | 'updatedAt'>>;

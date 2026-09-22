import { getConformityCheckerQueue } from '../queue/ConformityCheckerQueue';
import { getDosageAgentQueue } from '../queue/DosageAgentQueue';
import { getFertilizerLabelExtractionQueue } from '../queue/FertilizerLabelExtractionQueue';
import { getFieldExtractionQueue } from '../queue/FieldExtractionQueue';
import { getLabelExtractionQueue } from '../queue/LabelExtractionQueue';
import type { QueueKeepAliveRuntime } from './queue-keepalive-runtime';

interface JobStats {
  readonly waiting: number;
  readonly active: number;
  readonly delayed: number;
  readonly completed: number;
  readonly failed: number;
}

export interface DetailedJobStatus {
  readonly hasJobs: boolean;
  readonly activeCount: number;
  readonly waitingCount: number;
  readonly delayedCount: number;
  readonly estimatedTimeRemaining: number;
  readonly queueStats: Readonly<Record<string, JobStats>>;
}

const EMPTY_STATS: JobStats = {
  waiting: 0,
  active: 0,
  delayed: 0,
  completed: 0,
  failed: 0,
};

function normalizeStats(stats: Partial<JobStats>): JobStats {
  return {
    waiting: stats.waiting ?? 0,
    active: stats.active ?? 0,
    delayed: stats.delayed ?? 0,
    completed: stats.completed ?? 0,
    failed: stats.failed ?? 0,
  };
}

function sumStats(stats: readonly JobStats[], key: keyof JobStats): number {
  return stats.reduce((total, value) => total + value[key], 0);
}

/** Read aggregate queue activity without exposing job payloads. */
export async function checkForPendingJobsDetailed(
  runtime: QueueKeepAliveRuntime,
): Promise<DetailedJobStatus> {
  try {
    const rawStats = await Promise.all([
      getLabelExtractionQueue().queue.getJobCounts(),
      getDosageAgentQueue().queue.getJobCounts(),
      getFieldExtractionQueue().queue.getJobCounts(),
      getFertilizerLabelExtractionQueue().queue.getJobCounts(),
      getConformityCheckerQueue().queue.getJobCounts(),
    ]);
    const stats = rawStats.map(normalizeStats);
    const [label, dosage, field, fertilizer, conformity] = stats;
    const activeCount = sumStats(stats, 'active');
    const waitingCount = sumStats(stats, 'waiting');
    const delayedCount = sumStats(stats, 'delayed');
    const hasJobs = activeCount > 0 || waitingCount > 0 || delayedCount > 0;
    const estimatedTimeRemaining = activeCount * 15 * 60 * 1000;
    if (hasJobs) runtime.recordJobActivity();
    return {
      hasJobs,
      activeCount,
      waitingCount,
      delayedCount,
      estimatedTimeRemaining,
      queueStats: { label, dosage, field, fertilizer, conformity },
    };
  } catch (error) {
    console.error('[QUEUE-KEEPALIVE] Error checking queue activity:', error);
    return {
      hasJobs: true,
      activeCount: 0,
      waitingCount: 0,
      delayedCount: 0,
      estimatedTimeRemaining: 0,
      queueStats: {
        label: EMPTY_STATS,
        dosage: EMPTY_STATS,
        field: EMPTY_STATS,
        fertilizer: EMPTY_STATS,
        conformity: EMPTY_STATS,
      },
    };
  }
}

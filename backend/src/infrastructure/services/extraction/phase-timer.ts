/**
 * Tiny helper for measuring durations of consecutive phases of an operation.
 *
 * Usage:
 *   const timer = new PhaseTimer();
 *   await uploadToStorage();
 *   timer.lap('storageUploadMs');
 *   await persistRecord();
 *   timer.lap('dbInitMs');
 *   ...
 *   recordBatchPhaseTimings({ ...timer.toRecord(), batchId, ... });
 */
export class PhaseTimer {
  private last: number = Date.now();
  private readonly phases: Record<string, number> = {};

  /** Records the time elapsed since the last `lap()` (or construction). */
  lap(phase: string): number {
    const now = Date.now();
    const duration = now - this.last;
    this.phases[phase] = (this.phases[phase] ?? 0) + duration;
    this.last = now;
    return duration;
  }

  /** Snapshot of all measured phases. */
  toRecord(): Readonly<Record<string, number>> {
    return { ...this.phases };
  }
}

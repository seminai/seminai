import { performKeepAliveWithRetry } from './queue-keepalive-ping';
import { QueueKeepAliveRuntime, type KeepAliveMetrics } from './queue-keepalive-runtime';
import { checkForPendingJobsDetailed } from './queue-job-status';

const CHECK_INTERVAL_MS = 15_000;
const KEEP_ALIVE_INTERVAL_MS = 10_000;
const IDLE_TIMEOUT_MS = 2 * 60 * 1000;
const runtime = new QueueKeepAliveRuntime();

async function updateKeepAliveState(): Promise<void> {
  const jobStatus = await checkForPendingJobsDetailed(runtime);
  const idleTime = Date.now() - runtime.lastJobActivityTime;
  if (jobStatus.hasJobs && !runtime.keepAliveInterval) {
    runtime.keepAliveInterval = setInterval(
      () => performKeepAliveWithRetry(runtime),
      KEEP_ALIVE_INTERVAL_MS,
    );
    await performKeepAliveWithRetry(runtime);
    return;
  }
  if (!jobStatus.hasJobs && runtime.keepAliveInterval && idleTime > IDLE_TIMEOUT_MS) {
    clearInterval(runtime.keepAliveInterval);
    runtime.keepAliveInterval = null;
  }
}

/** Start queue activity monitoring for the inline-worker runtime. */
export function startQueueKeepAliveService(): void {
  if (runtime.isEnabled) return;
  runtime.isEnabled = true;
  runtime.checkJobsInterval = setInterval(() => void updateKeepAliveState(), CHECK_INTERVAL_MS);
  void checkForPendingJobsDetailed(runtime);
}

/** Stop queue activity monitoring and release every timer. */
export function stopQueueKeepAliveService(): void {
  if (!runtime.isEnabled) return;
  runtime.isEnabled = false;
  if (runtime.keepAliveInterval) clearInterval(runtime.keepAliveInterval);
  if (runtime.checkJobsInterval) clearInterval(runtime.checkJobsInterval);
  runtime.keepAliveInterval = null;
  runtime.checkJobsInterval = null;
}

/** Return aggregate keep-alive counters without exposing queue payloads. */
export function getKeepAliveMetrics(): KeepAliveMetrics & { readonly isEnabled: boolean } {
  return { ...runtime.getMetrics(), isEnabled: runtime.isEnabled };
}

/** Reset aggregate keep-alive counters. */
export function resetKeepAliveMetrics(): void {
  runtime.resetMetrics();
}

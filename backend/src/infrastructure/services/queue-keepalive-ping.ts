import type { QueueKeepAliveRuntime } from './queue-keepalive-runtime';

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_RETRY_ATTEMPTS = 3;

function getServerUrl(): string {
  return process.env.SERVER_URL ?? `http://localhost:${process.env.PORT ?? 8081}`;
}

const wait = async (durationMs: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
};

/** Ping the local API while an inline worker is processing queued jobs. */
export async function performKeepAliveWithRetry(
  runtime: QueueKeepAliveRuntime,
  maxRetries: number = MAX_RETRY_ATTEMPTS,
): Promise<void> {
  runtime.recordRequest();
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const response = await fetch(`${getServerUrl()}/health`, {
        method: 'GET',
        headers: { 'User-Agent': 'queue-keepalive-service', 'X-Keep-Alive': 'true' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      runtime.recordSuccess();
      return;
    } catch (error) {
      runtime.recordFailure();
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === maxRetries) {
        console.error(`[QUEUE-KEEPALIVE] ${maxRetries} attempts failed: ${message}`);
        return;
      }
      await wait(1_000 * 2 ** (attempt - 1));
    }
  }
}

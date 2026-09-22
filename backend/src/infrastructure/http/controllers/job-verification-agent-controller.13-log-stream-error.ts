import type { JobVerificationAgentControllerContext } from './job-verification-agent-controller.context';

export function jobVerificationAgentControllerLogStreamError(this: JobVerificationAgentControllerContext, {
    threadId,
    eventType,
    error,
  }: {
    threadId: string;
    eventType: string;
    error: unknown;
  }): void {
    const errorMessage = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    console.error('[JOB-VERIFICATION-STREAM] Error event', {
      threadId,
      eventType,
      errorName,
      errorMessage,
    });
  }

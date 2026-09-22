import type { EmailServiceContext } from './email-service.context';

export function emailServiceIsConnectionError(this: EmailServiceContext, error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return (
      message.includes('connection closed') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('socket hang up')
    );
  }

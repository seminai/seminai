import { Prisma } from '@prisma/client';
import type { LlmUsageLoggerContext } from './llm-usage-logger.context';

export function llmUsageLoggerIsRetryableError(this: LlmUsageLoggerContext, error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const retryableCodes = ['P2024', 'P1001', 'P1002', 'P1008', 'P1017'];
      return retryableCodes.includes(error.code);
    }
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('connection') ||
        message.includes('timeout') ||
        message.includes('pool') ||
        message.includes('econnrefused') ||
        message.includes('econnreset')
      );
    }
    return false;
  }

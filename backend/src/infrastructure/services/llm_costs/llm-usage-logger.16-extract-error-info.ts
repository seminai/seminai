import { Prisma } from '@prisma/client';
import type { LlmUsageLoggerContext } from './llm-usage-logger.context';

export function llmUsageLoggerExtractErrorInfo(this: LlmUsageLoggerContext, error: unknown): { code?: string; message: string } {
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { code, message };
  }

import { LlmJobType } from '@prisma/client';

/**
 * Context information passed through dosage agent flows
 * Contains job and user information for logging and cost tracking
 */
export interface DosageAgentContext {
  readonly jobId: string;
  readonly userId: string;
  readonly companyId?: string;
  readonly jobGroupId?: string;
  readonly jobType?: LlmJobType;
}

/**
 * Check if context is available
 */
export function hasContext(context?: DosageAgentContext): context is DosageAgentContext {
  return context !== undefined && Boolean(context.jobId) && Boolean(context.userId);
}

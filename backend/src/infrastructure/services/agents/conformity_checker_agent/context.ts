import { DosageAgentContext } from '../dosage_agent/context';

/**
 * Context information passed through conformity checker agent
 * Contains job and user information for logging
 */
export interface ConformityCheckerContext {
  readonly jobId: string;
  readonly userId: string;
  readonly companyId?: string;
}

/**
 * Check if context is available
 */
export function hasContext(
  context?: ConformityCheckerContext,
): context is ConformityCheckerContext {
  return context !== undefined && Boolean(context.jobId) && Boolean(context.userId);
}

/**
 * Converts ConformityCheckerContext to DosageAgentContext for reusing dosage_agent utilities
 */
export function toDosageAgentContext(
  ctx?: ConformityCheckerContext,
): DosageAgentContext | undefined {
  if (!ctx) return undefined;
  return {
    jobId: ctx.jobId,
    userId: ctx.userId,
    companyId: ctx.companyId,
  };
}

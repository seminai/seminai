import { LlmJobType } from '@prisma/client';
import type { UsageAccumulator } from '../../llm_costs/usage';
import type { AgentGraphFactoryContext } from './graph.context';
import { usageLogger } from './graph.support';

/** Persist aggregate token usage without blocking the agent response. */
export function logChatDosageUsage(
  accumulator: UsageAccumulator,
  context: AgentGraphFactoryContext,
): void {
  void usageLogger.logFromAccumulator(accumulator, {
    userId: context.userId,
    jobId: context.jobId,
    jobType: LlmJobType.CHAT_DOSAGE,
    model: context.modelName,
    metadata: { step: 'chat-dosage-agent' },
  }).catch((error: unknown) => {
    console.warn('[CHAT-DOSAGE-AGENT] Failed to log usage:', error);
  });
}

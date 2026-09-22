import type { AgentEvent } from '@/lib/job-verification-agent';
import { sanitizeUserFacingText } from '@/lib/safe-display';
import type { VerificationLiveStep } from './types';

const MAX_LIVE_STEPS = 8;

function nowIso(): string {
  return new Date().toISOString();
}

export function buildLiveStep(
  kind: VerificationLiveStep['kind'],
  text: string,
): VerificationLiveStep {
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    kind,
    text: sanitizeUserFacingText(text),
    createdAtIso: nowIso(),
  };
}

export function appendLiveStep(
  steps: readonly VerificationLiveStep[],
  step: VerificationLiveStep,
): readonly VerificationLiveStep[] {
  const next = [...steps, step];
  return next.slice(Math.max(0, next.length - MAX_LIVE_STEPS));
}

export function pickEventStep(event: AgentEvent): VerificationLiveStep | null {
  if (event.type === 'thinking' && typeof event.thinking === 'string' && event.thinking.trim().length > 0) {
    return buildLiveStep('thinking', event.thinking);
  }
  if (event.type === 'reasoning' && typeof event.reasoning === 'string' && event.reasoning.trim().length > 0) {
    return buildLiveStep('reasoning', event.reasoning);
  }
  if (event.type === 'task_progress' && typeof event.thinking === 'string' && event.thinking.trim().length > 0) {
    return buildLiveStep('task_progress', event.thinking);
  }
  if (event.type === 'task_update') {
    const tasks = Array.isArray(event.tasks) ? event.tasks : [];
    const inProgress = tasks.find((task) => {
      if (!task || typeof task !== 'object') return false;
      return String((task as Record<string, unknown>).status ?? '').toLowerCase() === 'in_progress';
    }) as Record<string, unknown> | undefined;
    if (inProgress && typeof inProgress.description === 'string' && inProgress.description.trim().length > 0) {
      return buildLiveStep('task_update', `Task in corso: ${inProgress.description}`);
    }
    return buildLiveStep('task_update', 'Piano operativo aggiornato.');
  }
  if (event.type === 'tool_start') {
    const thinkingText = typeof event.thinking === 'string' ? event.thinking : '';
    if (thinkingText.trim().length > 0) return buildLiveStep('tool_start', thinkingText);
    const toolCall = event.toolCall as Record<string, unknown> | undefined;
    const toolName = typeof toolCall?.name === 'string' ? toolCall.name : 'tool';
    return buildLiveStep('tool_start', `Avvio tool: ${toolName}`);
  }
  if (event.type === 'tool_result') {
    const toolResult = event.toolResult as Record<string, unknown> | undefined;
    const summary =
      typeof toolResult?.summary === 'string' && toolResult.summary.trim().length > 0
        ? toolResult.summary
        : typeof event.thinking === 'string' && event.thinking.trim().length > 0
          ? event.thinking
          : 'Risultato tool ricevuto.';
    return buildLiveStep('tool_result', summary);
  }
  return null;
}

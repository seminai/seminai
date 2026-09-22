import type { AgentResponse } from '../../services/agents/dosage_agent_react/DosageReactAgent';
import type { StreamEvent } from '../../services/agents/dosage_agent_react/type/events';
import type { AgentChatControllerContext } from './agent-chat-controller.context';

export function agentChatControllerBuildStreamEventFromAgentResponse(this: AgentChatControllerContext, response: AgentResponse): StreamEvent {
    if (response.status === 'COMPLETED') {
      return {
        type: 'complete',
        sources: response.sources,
        response: {
          status: response.status,
          message: response.message,
          sources: response.sources,
        },
      };
    }

    if (response.status === 'REQUIRES_APPROVAL') {
      const pending = response.pendingToolCalls?.[0];
      return {
        type: 'requires_approval',
        content: response.message,
        riskLevel: pending?.riskLevel ?? 'medium',
        toolCall: pending
          ? {
              name: pending.name,
              args: pending.args ?? {},
              id: pending.id,
            }
          : undefined,
        response: {
          status: response.status,
          message: response.message,
          pendingToolCalls: response.pendingToolCalls?.map((toolCall) => ({
            name: toolCall.name,
            args: toolCall.args ?? {},
            id: toolCall.id,
          })),
        },
      };
    }

    if (response.status === 'CANCELLED') {
      return {
        type: 'cancelled',
        response: { status: response.status, message: response.message },
      };
    }

    return {
      type: 'error',
      error: response.error ?? response.message ?? "Errore durante l'esecuzione dello strumento.",
      response: {
        status: response.status,
        message: response.message,
        error: response.error,
      },
    };
  }

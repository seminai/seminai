import {
  approveAction,
  createReactAgent,
  getAgentState,
  getCachedAgentApp,
  handleUserMessage,
  rejectAction,
  type AgentApp,
  type AgentResponse,
  type CreateReactAgentOptions,
  type DosageReactState,
  type StreamEvent,
  type AgentStreamResponse,
} from '../dosage_agent_react';
import { streamReactAgent, type StreamReactAgentOptions } from '../dosage_agent_react/streaming';
import type { ChatAgentKind, ChatAgentPort } from './ChatAgentPort';

/**
 * {@link ChatAgentPort} backed by the agricultural dosage ReAct agent.
 *
 * Every method is a 1:1 delegation to the existing `dosage_agent_react` public
 * functions, so routing through this adapter is behaviourally identical to the
 * pre-Phase-3 direct calls (zero regression for agricultural users).
 */
export class DosageChatAgent implements ChatAgentPort {
  readonly kind: ChatAgentKind = 'dosage';

  stream(
    options: StreamReactAgentOptions,
  ): AsyncGenerator<StreamEvent, AgentStreamResponse, unknown> {
    return streamReactAgent(options);
  }

  createApp(options: CreateReactAgentOptions): Promise<AgentApp> {
    return createReactAgent(options);
  }

  getCachedApp(threadId: string): AgentApp | undefined {
    return getCachedAgentApp(threadId);
  }

  handleUserMessage(app: AgentApp, threadId: string, userMessage: string): Promise<AgentResponse> {
    return handleUserMessage(app, threadId, userMessage);
  }

  approve(app: AgentApp, threadId: string): Promise<AgentResponse> {
    return approveAction(app, threadId);
  }

  reject(app: AgentApp, threadId: string, reason: string): Promise<AgentResponse> {
    return rejectAction(app, threadId, reason);
  }

  getState(app: AgentApp, threadId: string): Promise<DosageReactState> {
    return getAgentState(app, threadId);
  }
}

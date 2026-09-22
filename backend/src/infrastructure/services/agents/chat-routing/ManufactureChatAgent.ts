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
 * {@link ChatAgentPort} for MANUFACTURING workspaces.
 *
 * Reuses the same ReAct graph/streaming/HITL as the dosage agent, but forces the
 * `MANUFACTURING` tool bundle (warehouse/stock/document import only) and the
 * manufacturing prompt domain on the two entry points that build the graph.
 * State-only operations (approve/reject/getState/handleUserMessage/getCachedApp)
 * act on an already-built thread and delegate 1:1.
 */
export class ManufactureChatAgent implements ChatAgentPort {
  readonly kind: ChatAgentKind = 'manufacture';

  stream(
    options: StreamReactAgentOptions,
  ): AsyncGenerator<StreamEvent, AgentStreamResponse, unknown> {
    return streamReactAgent({ ...options, toolBundle: 'MANUFACTURING', domain: 'MANUFACTURING' });
  }

  createApp(options: CreateReactAgentOptions): Promise<AgentApp> {
    return createReactAgent({ ...options, toolBundle: 'MANUFACTURING', domain: 'MANUFACTURING' });
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

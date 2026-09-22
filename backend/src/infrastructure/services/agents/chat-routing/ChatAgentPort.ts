import type {
  AgentApp,
  AgentResponse,
  CreateReactAgentOptions,
  DosageReactState,
  StreamEvent,
  AgentStreamResponse,
  StreamReactAgentOptions,
} from '../dosage_agent_react';

/**
 * Discriminator for the concrete chat agent behind a {@link ChatAgentPort}.
 */
export type ChatAgentKind = 'dosage' | 'manufacture';

/**
 * Contract used by {@link AgentChatController} to drive a chat agent regardless
 * of the workspace kind it serves.
 *
 * It facades the public surface of the dosage ReAct agent so the controller no
 * longer imports agent functions directly. A second implementation
 * (manufacturing) can be added in Phase 4 without touching the controller.
 */
export interface ChatAgentPort {
  /** Concrete agent identity, useful for logging/assertions. */
  readonly kind: ChatAgentKind;

  /** Stream an agent turn with token-by-token delivery and HITL events. */
  stream(
    options: StreamReactAgentOptions,
  ): AsyncGenerator<StreamEvent, AgentStreamResponse, unknown>;

  /** Build (or reuse) the agent app bound to a thread. */
  createApp(options: CreateReactAgentOptions): Promise<AgentApp>;

  /** Return the cached agent app for a thread, if any (preserves checkpointer). */
  getCachedApp(threadId: string): AgentApp | undefined;

  /** Process a non-streaming user message. */
  handleUserMessage(app: AgentApp, threadId: string, userMessage: string): Promise<AgentResponse>;

  /** Approve a pending tool execution (HITL gate). */
  approve(app: AgentApp, threadId: string): Promise<AgentResponse>;

  /** Reject a pending tool execution (HITL gate). */
  reject(app: AgentApp, threadId: string, reason: string): Promise<AgentResponse>;

  /** Read the conversation state of a thread. */
  getState(app: AgentApp, threadId: string): Promise<DosageReactState>;
}

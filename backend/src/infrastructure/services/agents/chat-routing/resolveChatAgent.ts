import { WorkspaceKind } from '@prisma/client';
import type { ChatAgentPort } from './ChatAgentPort';
import { DosageChatAgent } from './DosageChatAgent';
import { ManufactureChatAgent } from './ManufactureChatAgent';

/**
 * Singleton agents — stateless adapters, safe to share across requests.
 */
const dosageChatAgent: ChatAgentPort = new DosageChatAgent();
const manufactureChatAgent: ChatAgentPort = new ManufactureChatAgent();

/**
 * Registry mapping a workspace kind to its chat agent. Both P0 kinds are wired:
 * AGRICULTURAL → dosage agent, MANUFACTURING → manufacturing agent (Phase 4).
 */
const CHAT_AGENT_REGISTRY: Partial<Record<WorkspaceKind, ChatAgentPort>> = {
  [WorkspaceKind.AGRICULTURAL]: dosageChatAgent,
  [WorkspaceKind.MANUFACTURING]: manufactureChatAgent,
};

/**
 * Resolve the chat agent for a workspace kind.
 *
 * A `null` kind (legacy / routing disabled) resolves to the dosage agent.
 * An unregistered kind (e.g. MANUFACTURING before Phase 4) falls back to the
 * dosage agent with a warning, so the endpoint never fails closed.
 */
export function resolveChatAgent(input: {
  readonly workspaceKind: WorkspaceKind | null;
}): ChatAgentPort {
  const { workspaceKind } = input;

  if (workspaceKind === null) {
    return dosageChatAgent;
  }

  const agent = CHAT_AGENT_REGISTRY[workspaceKind];
  if (agent) {
    return agent;
  }

  console.warn(
    `[ChatRouting] No chat agent registered for workspace kind "${workspaceKind}"; ` +
      'falling back to dosage agent (Phase 3 fallback).',
  );
  return dosageChatAgent;
}

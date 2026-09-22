import { HumanMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { AgentApp } from '../DosageReactAgent';

/** The node name whose presence in `next` indicates we are before the guard. */
const PRE_GUARD_NEXT_NODE = 'guard';

/** Max checkpoints to scan when looking for a pre-guard snapshot. */
const HISTORY_SCAN_LIMIT = 20;

export interface ForkResult {
  /** Config pointing to the newly created fork checkpoint. */
  readonly forkConfig: RunnableConfig;
  /** The checkpoint ID that was forked from. */
  readonly sourceCheckpointId: string;
}

/**
 * Finds the most recent checkpoint before the guard node and forks from it,
 * injecting the rejection reason as a HumanMessage.
 *
 * Uses `asNode: 'taskPlanner'` so the graph resumes at the `agent` node
 * (taskPlanner's successor). The agent re-runs with the rejection feedback
 * visible in the message history and can choose a different approach.
 *
 * @returns The fork config for resuming, or undefined if no suitable checkpoint found.
 */
export async function forkBeforeGuard(options: {
  readonly app: AgentApp;
  readonly threadId: string;
  readonly rejectionReason: string;
}): Promise<ForkResult | undefined> {
  const { app, threadId, rejectionReason } = options;
  const config: RunnableConfig = { configurable: { thread_id: threadId } };

  const iterator = app.getStateHistory(config, { limit: HISTORY_SCAN_LIMIT });

  let preGuardCheckpointId: string | undefined;
  let preGuardConfig: RunnableConfig | undefined;

  for await (const snapshot of iterator) {
    if (snapshot.next.includes(PRE_GUARD_NEXT_NODE)) {
      const configurable = snapshot.config?.configurable as Record<string, unknown> | undefined;
      const id = configurable?.checkpoint_id as string | undefined;
      if (id) {
        preGuardCheckpointId = id;
        preGuardConfig = snapshot.config;
      }
      break;
    }
  }

  if (!preGuardConfig || !preGuardCheckpointId) {
    console.warn(
      `[forkBeforeGuard] No pre-guard checkpoint found for thread ${threadId}. Falling back.`,
    );
    return undefined;
  }

  console.log(
    `[forkBeforeGuard] Forking from checkpoint ${preGuardCheckpointId} for thread ${threadId}`,
  );

  const rejectionMessage = new HumanMessage(
    `[REJECTION FEEDBACK] The following action was rejected by the user: ${rejectionReason}. ` +
      `Please re-plan with a different approach. Do NOT repeat the rejected action.`,
  );

  // asNode: 'taskPlanner' → graph resumes at 'agent' (taskPlanner's successor).
  // The agent sees the original AIMessage with tool_calls + this rejection feedback,
  // and re-reasons without re-executing the rejected tool.
  const forkConfig = await app.updateState(
    preGuardConfig as { configurable: { thread_id: string } },
    { messages: [rejectionMessage] },
    'taskPlanner',
  );

  return { forkConfig, sourceCheckpointId: preGuardCheckpointId };
}

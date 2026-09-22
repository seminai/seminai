import type { RunnableConfig } from '@langchain/core/runnables';
import type { AgentApp } from '../DosageReactAgent';
import type { DosageReactState } from '../type/state';
import type {
  CheckpointHistoryEntry,
  CheckpointHistoryResponse,
  CheckpointStatePreview,
} from '../type/checkpoint-history';

const DEFAULT_HISTORY_LIMIT = 50;

function buildStatePreview(values: Record<string, unknown>): CheckpointStatePreview {
  const state = values as unknown as DosageReactState;
  return {
    messageCount: state.messages?.length ?? 0,
    pendingAction: state.pendingAction,
    loopCounter: state.loopCounter ?? 0,
    taskListLength: state.taskList?.length ?? 0,
  };
}

function extractCheckpointId(config: RunnableConfig | undefined): string | undefined {
  const configurable = config?.configurable as Record<string, unknown> | undefined;
  return configurable?.checkpoint_id as string | undefined;
}

/**
 * Returns a lightweight checkpoint history for a thread.
 * Each entry contains a state preview (message count, not full messages).
 */
export async function getThreadHistory(options: {
  readonly app: AgentApp;
  readonly threadId: string;
  readonly limit?: number;
}): Promise<CheckpointHistoryResponse> {
  const { app, threadId, limit = DEFAULT_HISTORY_LIMIT } = options;
  const config: RunnableConfig = { configurable: { thread_id: threadId } };
  const entries: CheckpointHistoryEntry[] = [];

  const iterator = app.getStateHistory(config, { limit });
  for await (const snapshot of iterator) {
    const checkpointId = extractCheckpointId(snapshot.config);
    if (!checkpointId) continue;

    const parentCheckpointId = extractCheckpointId(snapshot.parentConfig);

    const metadata = snapshot.metadata as
      | {
          source?: string;
          step?: number;
          writes?: Record<string, unknown>;
        }
      | undefined;

    // Determine which node produced this checkpoint from metadata.writes keys
    const nodeExecuted = metadata?.writes
      ? Object.keys(metadata.writes).find((k) => k !== '__start__')
      : undefined;

    entries.push({
      checkpointId,
      parentCheckpointId,
      nodeExecuted,
      timestamp: snapshot.createdAt,
      next: snapshot.next,
      step: metadata?.step ?? -1,
      source: metadata?.source ?? 'loop',
      statePreview: buildStatePreview(snapshot.values as Record<string, unknown>),
    });
  }

  return { threadId, checkpoints: entries };
}

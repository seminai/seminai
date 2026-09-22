import type { DosageReactState } from './state';

/** Lightweight preview of a checkpoint state, without full message payloads. */
export interface CheckpointStatePreview {
  readonly messageCount: number;
  readonly pendingAction: DosageReactState['pendingAction'] | undefined;
  readonly loopCounter: number;
  readonly taskListLength: number;
}

/** Single entry in the thread checkpoint history. */
export interface CheckpointHistoryEntry {
  readonly checkpointId: string;
  readonly parentCheckpointId: string | undefined;
  readonly nodeExecuted: string | undefined;
  readonly timestamp: string | undefined;
  readonly next: readonly string[];
  readonly step: number;
  readonly source: string;
  readonly statePreview: CheckpointStatePreview;
}

/** Response shape for GET /admin/agent/threads/:threadId/history */
export interface CheckpointHistoryResponse {
  readonly threadId: string;
  readonly checkpoints: readonly CheckpointHistoryEntry[];
}

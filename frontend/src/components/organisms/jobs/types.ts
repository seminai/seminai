export type RightSidebarMode = 'details' | 'history' | 'verification';

export interface JobGroupRow {
  readonly id: string;
  readonly jobId: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly createdAt: string;
  readonly createdAtRaw: string;
  readonly totalOperations: number;
  readonly verifiedOperations: number;
  readonly pendingOperations: number;
}

export interface JobOperationRow {
  readonly id: string;
  readonly jobId: string;
  readonly dateIso: string | null;
  readonly category: string;
  readonly productName: string;
  readonly productionUnitName: string;
  readonly productionUnitId: string;
  readonly quantity: number | null;
  readonly unitOfMeasureQuantity: string;
  readonly machineId: string | null;
  readonly machineName: string | null;
  readonly isVerified: boolean;
  readonly conformityChecked: boolean;
  readonly note: string | null;
  readonly alertNotes: unknown;
  readonly history: unknown;
  readonly raw: Record<string, unknown>;
}

export interface JobRowDraft {
  readonly id: string;
  readonly isNew: boolean;
  readonly sourceOperationId?: string;
  dateIso: string;
  quantity: string;
  machineId: string;
  isVerified: boolean;
  category: string;
  unitOfMeasureQuantity: string;
  productionUnitId: string;
}

export type JobDraftEditableField = keyof Omit<
  JobRowDraft,
  'id' | 'isNew' | 'sourceOperationId'
>;

export interface VerificationSnapshot {
  readonly status: 'idle' | 'streaming' | 'requires_approval' | 'completed' | 'error';
  readonly message: string;
  readonly updatedAtIso: string;
  readonly threadId: string;
  readonly liveSteps: readonly VerificationLiveStep[];
}

export type VerificationLiveStepKind =
  | 'thinking'
  | 'reasoning'
  | 'task_update'
  | 'task_progress'
  | 'tool_start'
  | 'tool_result'
  | 'system';

export interface VerificationLiveStep {
  readonly id: string;
  readonly kind: VerificationLiveStepKind;
  readonly text: string;
  readonly createdAtIso: string;
}

export interface HistoryEntry {
  readonly key: string;
  readonly operationId: string;
  readonly text: string;
}

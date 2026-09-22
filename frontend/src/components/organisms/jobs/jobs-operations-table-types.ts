import type { JobDraftEditableField, JobOperationRow, JobRowDraft } from './types';

export interface MachineOption {
  readonly id: string;
  readonly name: string;
}

export interface JobOperationsTableRow {
  readonly kind: 'operation' | 'draft';
  readonly rowId: string;
  readonly operation: JobOperationRow | null;
  readonly draft: JobRowDraft | null;
  readonly statoLabel: string;
  readonly verificaLabel: string;
  readonly tipoLabel: string;
  readonly prodottoLabel: string;
  readonly upLabel: string;
  readonly quantitaLabel: string;
  readonly macchinaLabel: string;
  /** YYYY-MM-DD or ISO for sorting. */
  readonly dataSortKey: string;
  /** Shown in filters / facets (aligned with date cell). */
  readonly dataLabel: string;
}

export interface JobOperationsColumnsParams {
  readonly machineOptions: readonly MachineOption[];
  readonly onSelectOperation: (operationId: string, checked: boolean) => void;
  readonly onDraftChange: (
    operationId: string,
    field: JobDraftEditableField,
    value: string | boolean,
  ) => void;
  readonly onRemoveDraft: (draftId: string) => void;
}

export interface JobsOperationsTableProps {
  readonly operations: readonly JobOperationRow[];
  readonly drafts: Readonly<Record<string, JobRowDraft>>;
  readonly machineOptions: readonly MachineOption[];
  readonly selectedOperationIds: readonly string[];
  readonly hasUnsavedChanges: boolean;
  readonly isSaving: boolean;
  readonly saveMessage: string | null;
  readonly onSelectOperation: (operationId: string, checked: boolean) => void;
  readonly onDraftChange: (
    operationId: string,
    field: JobDraftEditableField,
    value: string | boolean,
  ) => void;
  readonly onRemoveDraft: (draftId: string) => void;
  readonly onSave: () => Promise<void>;
  readonly onBulkVerifySelected: () => Promise<void>;
}

export function machineNameForId(
  machineId: string | null | undefined,
  options: readonly MachineOption[],
): string {
  const id = machineId?.trim() ?? '';
  if (!id) return '—';
  const found = options.find((m) => m.id === id);
  return found?.name ?? id;
}

import type { JobOperationRow, JobRowDraft } from './types';

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

export function machineNameForId(
  machineId: string | null | undefined,
  options: readonly MachineOption[],
): string {
  const id = machineId?.trim() ?? '';
  if (!id) return '—';
  const found = options.find((m) => m.id === id);
  return found?.name ?? id;
}

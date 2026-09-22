import type { JobOperationRow, JobRowDraft } from './types';
import type { JobOperationsTableRow } from './jobs-operations-table-types';

export const JOB_OPERATIONS_COLUMN_LABELS: Record<string, string> = {
  stato: 'Stato',
  data: 'Data',
  verifica: 'Verifica',
  tipo: 'Tipo',
  prodotto: 'Prodotto',
  up: 'UP',
  quantita: 'Quantità',
  macchina: 'Macchina',
};

export const JOB_OPERATIONS_EXPORT_COLUMNS = [
  { label: JOB_OPERATIONS_COLUMN_LABELS.stato, getValue: (row: JobOperationsTableRow) => row.statoLabel },
  { label: JOB_OPERATIONS_COLUMN_LABELS.data, getValue: (row: JobOperationsTableRow) => row.dataLabel },
  { label: JOB_OPERATIONS_COLUMN_LABELS.verifica, getValue: (row: JobOperationsTableRow) => row.verificaLabel },
  { label: JOB_OPERATIONS_COLUMN_LABELS.tipo, getValue: (row: JobOperationsTableRow) => row.tipoLabel },
  { label: JOB_OPERATIONS_COLUMN_LABELS.prodotto, getValue: (row: JobOperationsTableRow) => row.prodottoLabel },
  { label: JOB_OPERATIONS_COLUMN_LABELS.up, getValue: (row: JobOperationsTableRow) => row.upLabel },
  { label: JOB_OPERATIONS_COLUMN_LABELS.quantita, getValue: (row: JobOperationsTableRow) => row.quantitaLabel },
  { label: JOB_OPERATIONS_COLUMN_LABELS.macchina, getValue: (row: JobOperationsTableRow) => row.macchinaLabel },
] as const;

export function isZeroQuantityRow(
  operation: JobOperationRow,
  draft: JobRowDraft | undefined,
): boolean {
  if (!draft) return operation.quantity === 0;
  const parsed = Number.parseFloat(draft.quantity);
  return Number.isNaN(parsed) ? operation.quantity === 0 : parsed === 0;
}

export function getUnitSuffix(unit: string | undefined): string | null {
  const normalized = unit?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

import { formatDateForView, toDateInputValue } from './mappers';
import type { JobOperationRow, JobRowDraft } from './types';
import { getVerificationStatusMeta } from './job-verification-status';
import { machineNameForId, type JobOperationsTableRow, type MachineOption } from './jobs-operations-table-types';

function quantitaDisplay(operation: JobOperationRow, draft: JobRowDraft | undefined): string {
  const q = draft?.quantity != null && draft.quantity.trim() !== '' ? draft.quantity : String(operation.quantity ?? '');
  const u = operation.unitOfMeasureQuantity?.trim() ?? '';
  return u ? `${q} ${u}`.trim() : q;
}

export function buildJobOperationsTableRows(
  sortedOperations: readonly JobOperationRow[],
  drafts: Readonly<Record<string, JobRowDraft>>,
  machineOptions: readonly MachineOption[],
  newDrafts: readonly JobRowDraft[],
): JobOperationsTableRow[] {
  const operationRows: JobOperationsTableRow[] = sortedOperations.map((operation) => {
    const draft = drafts[operation.id];
    const isVerified = draft ? draft.isVerified : operation.isVerified;
    const meta = getVerificationStatusMeta({
      isVerified,
      conformityChecked: operation.conformityChecked,
    });
    const mid = draft?.machineId ?? operation.machineId ?? '';
    const dateInput = draft?.dateIso ?? toDateInputValue(operation.dateIso);
    return {
      kind: 'operation',
      rowId: operation.id,
      operation,
      draft: draft ?? null,
      statoLabel: meta.label,
      verificaLabel: isVerified ? 'Sì' : 'No',
      tipoLabel: operation.category || '—',
      prodottoLabel: operation.productName || '—',
      upLabel: operation.productionUnitName || '—',
      quantitaLabel: quantitaDisplay(operation, draft),
      macchinaLabel: machineNameForId(mid, machineOptions),
      dataSortKey: operation.dateIso ?? dateInput,
      dataLabel: dateInput || '—',
    };
  });

  const draftRows: JobOperationsTableRow[] = newDrafts.map((draft) => {
    const meta = getVerificationStatusMeta({
      isVerified: draft.isVerified,
      conformityChecked: false,
    });
    return {
      kind: 'draft',
      rowId: draft.id,
      operation: null,
      draft,
      statoLabel: meta.label,
      verificaLabel: draft.isVerified ? 'Sì' : 'No',
      tipoLabel: draft.category || '—',
      prodottoLabel: 'Nuova riga',
      upLabel: draft.productionUnitId || '—',
      quantitaLabel: draft.unitOfMeasureQuantity
        ? `${draft.quantity} ${draft.unitOfMeasureQuantity}`.trim()
        : draft.quantity,
      macchinaLabel: machineNameForId(draft.machineId, machineOptions),
      dataSortKey: draft.dateIso,
      dataLabel: draft.dateIso || '—',
    };
  });

  return [...operationRows, ...draftRows];
}

export function jobOperationsRowMatchesSearch(row: JobOperationsTableRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    row.statoLabel,
    row.verificaLabel,
    row.tipoLabel,
    row.prodottoLabel,
    row.upLabel,
    row.quantitaLabel,
    row.macchinaLabel,
    row.dataLabel,
    formatDateForView(row.dataSortKey || null),
    row.kind === 'draft' ? 'bozza' : '',
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

import { COLUMNS, createEmptyInvoiceEntry, type InvoiceColumnKey } from '@/lib/ag-grid/invoice-columns';
import {
  areInvoiceCellValuesEqual,
  getEmptyInvoiceCellValue,
  getInvoiceCellValue,
  isInvoiceCellValueEmpty,
  setInvoiceCellValue,
  type InvoiceCellValue,
} from '@/lib/invoice-cell-values';
import type { ConfirmableStockEntry } from '@/types/extraction';

export const INVOICE_CELL_OPERATIONS = ['move-up', 'move-down', 'clear', 'copy-above', 'copy-below'] as const;

export type InvoiceCellOperation = (typeof INVOICE_CELL_OPERATIONS)[number];

export interface InvoiceCellCoord {
  readonly rowIndex: number;
  readonly columnKey: InvoiceColumnKey;
}

export interface InvoiceCellConflict {
  readonly rowIndex: number;
  readonly columnKey: InvoiceColumnKey;
}

export interface InvoiceCellSelectionSummary {
  readonly cellCount: number;
  readonly rowCount: number;
}

export interface InvoiceCellOperationPlan {
  readonly status: 'ready' | 'blocked';
  readonly rows: readonly ConfirmableStockEntry[];
  readonly conflicts: readonly InvoiceCellConflict[];
  readonly nonEmptyCellCount: number;
  readonly requiresConfirmation: boolean;
  readonly blockedReason: string | null;
  readonly summary: InvoiceCellSelectionSummary;
}

interface InvoiceCellWrite {
  readonly target: InvoiceCellCoord;
  readonly value: InvoiceCellValue;
}

const COLUMN_ORDER = new Map(
  COLUMNS.map((column, index) => [column.key, index] as const),
);
const COLUMN_KEYS = new Set<InvoiceColumnKey>(COLUMNS.map((column) => column.key));

export const INVOICE_CELL_OPERATION_LABELS: Record<InvoiceCellOperation, string> = {
  'move-up': 'Sposta su',
  'move-down': 'Sposta giu',
  clear: 'Svuota celle',
  'copy-above': 'Copia sopra',
  'copy-below': 'Copia sotto',
};

export function isInvoiceColumnKey(value: string): value is InvoiceColumnKey {
  return COLUMN_KEYS.has(value as InvoiceColumnKey);
}

export function spreadsheetSelectionToInvoiceCells(
  selectedCells: ReadonlySet<string>,
): readonly InvoiceCellCoord[] {
  const cells: InvoiceCellCoord[] = [];

  for (const key of selectedCells) {
    const [rowPart, colPart] = key.split(':');
    const rowIndex = Number.parseInt(rowPart ?? '', 10);
    const columnIndex = Number.parseInt(colPart ?? '', 10);
    const columnKey = COLUMNS[columnIndex]?.key;

    if (Number.isInteger(rowIndex) && columnKey) {
      cells.push({ rowIndex, columnKey });
    }
  }

  return normalizeInvoiceCellSelection(cells);
}

export function normalizeInvoiceCellSelection(
  cells: readonly InvoiceCellCoord[],
): readonly InvoiceCellCoord[] {
  const byKey = new Map<string, InvoiceCellCoord>();

  for (const cell of cells) {
    if (cell.rowIndex < 0 || !Number.isInteger(cell.rowIndex)) continue;
    if (!isInvoiceColumnKey(cell.columnKey)) continue;
    byKey.set(cellKey(cell), cell);
  }

  return [...byKey.values()].sort((left, right) => {
    if (left.rowIndex !== right.rowIndex) return left.rowIndex - right.rowIndex;
    return columnOrder(left.columnKey) - columnOrder(right.columnKey);
  });
}

export function getInvoiceCellSelectionSummary(
  cells: readonly InvoiceCellCoord[],
): InvoiceCellSelectionSummary {
  const normalized = normalizeInvoiceCellSelection(cells);
  return {
    cellCount: normalized.length,
    rowCount: new Set(normalized.map((cell) => cell.rowIndex)).size,
  };
}

export function getInvoiceCellOperationBlockReason(
  rows: readonly ConfirmableStockEntry[],
  selectedCells: readonly InvoiceCellCoord[],
  operation: InvoiceCellOperation,
): string | null {
  const cells = normalizeInvoiceCellSelection(selectedCells)
    .filter((cell) => cell.rowIndex < rows.length);

  if (cells.length === 0) return 'Seleziona almeno una cella valida.';
  if (operation === 'move-up' || operation === 'copy-above') {
    if (cells.some((cell) => cell.rowIndex === 0)) {
      return 'La selezione include la prima riga.';
    }
  }
  if (operation === 'copy-below') {
    if (cells.some((cell) => cell.rowIndex >= rows.length - 1)) {
      return 'La selezione include l ultima riga.';
    }
  }

  return null;
}

export function planInvoiceCellOperation(params: {
  readonly rows: readonly ConfirmableStockEntry[];
  readonly selectedCells: readonly InvoiceCellCoord[];
  readonly operation: InvoiceCellOperation;
}): InvoiceCellOperationPlan {
  const cells = normalizeInvoiceCellSelection(params.selectedCells)
    .filter((cell) => cell.rowIndex < params.rows.length);
  const summary = getInvoiceCellSelectionSummary(cells);
  const blockedReason = getInvoiceCellOperationBlockReason(
    params.rows,
    cells,
    params.operation,
  );

  if (blockedReason) {
    return buildPlan(params.rows, [], 0, true, blockedReason, summary);
  }

  if (params.operation === 'clear') {
    const nextRows = clearCells(params.rows, cells);
    const nonEmptyCellCount = countNonEmptyCells(params.rows, cells);
    return buildPlan(nextRows, [], nonEmptyCellCount, nonEmptyCellCount > 0, null, summary);
  }

  const { writes, clears } = buildWrites(params.rows, cells, params.operation);
  const conflicts = findConflicts(params.rows, cells, writes, params.operation);
  const nextRows = applyWrites(params.rows, writes, clears);

  return buildPlan(nextRows, conflicts, 0, conflicts.length > 0, null, summary);
}

function buildPlan(
  rows: readonly ConfirmableStockEntry[],
  conflicts: readonly InvoiceCellConflict[],
  nonEmptyCellCount: number,
  requiresConfirmation: boolean,
  blockedReason: string | null,
  summary: InvoiceCellSelectionSummary,
): InvoiceCellOperationPlan {
  return {
    status: blockedReason ? 'blocked' : 'ready',
    rows,
    conflicts,
    nonEmptyCellCount,
    requiresConfirmation: blockedReason ? false : requiresConfirmation,
    blockedReason,
    summary,
  };
}

function buildWrites(
  rows: readonly ConfirmableStockEntry[],
  cells: readonly InvoiceCellCoord[],
  operation: InvoiceCellOperation,
): { readonly writes: readonly InvoiceCellWrite[]; readonly clears: readonly InvoiceCellCoord[] } {
  if (operation === 'copy-above' || operation === 'copy-below') {
    const delta = operation === 'copy-above' ? -1 : 1;
    return {
      writes: cells.map((cell) => ({
        target: cell,
        value: getInvoiceCellValue(rows[cell.rowIndex + delta], cell.columnKey),
      })),
      clears: [],
    };
  }

  const delta = operation === 'move-up' ? -1 : 1;
  const writes = cells.map((cell) => ({
    target: { rowIndex: cell.rowIndex + delta, columnKey: cell.columnKey },
    value: getInvoiceCellValue(rows[cell.rowIndex], cell.columnKey),
  }));
  const targetKeys = new Set(writes.map((write) => cellKey(write.target)));
  const clears = cells.filter((cell) => !targetKeys.has(cellKey(cell)));

  return { writes, clears };
}

function findConflicts(
  rows: readonly ConfirmableStockEntry[],
  selectedCells: readonly InvoiceCellCoord[],
  writes: readonly InvoiceCellWrite[],
  operation: InvoiceCellOperation,
): readonly InvoiceCellConflict[] {
  const selectedKeys = new Set(selectedCells.map(cellKey));
  const conflicts: InvoiceCellConflict[] = [];

  for (const write of writes) {
    if (write.target.rowIndex >= rows.length) continue;
    if (operation === 'move-up' || operation === 'move-down') {
      if (selectedKeys.has(cellKey(write.target))) continue;
    }

    const current = getInvoiceCellValue(rows[write.target.rowIndex], write.target.columnKey);
    if (isInvoiceCellValueEmpty(write.target.columnKey, current)) continue;
    if (areInvoiceCellValuesEqual(write.target.columnKey, current, write.value)) continue;
    conflicts.push(write.target);
  }

  return conflicts;
}

function applyWrites(
  rows: readonly ConfirmableStockEntry[],
  writes: readonly InvoiceCellWrite[],
  clears: readonly InvoiceCellCoord[],
): readonly ConfirmableStockEntry[] {
  const nextRows = rows.map((row) => ({ ...row }));
  const maxTargetIndex = writes.reduce(
    (max, write) => Math.max(max, write.target.rowIndex),
    rows.length - 1,
  );

  while (nextRows.length <= maxTargetIndex) {
    nextRows.push(createEmptyInvoiceEntry(nextRows[nextRows.length - 1]));
  }

  for (const write of writes) {
    nextRows[write.target.rowIndex] = setInvoiceCellValue(
      nextRows[write.target.rowIndex],
      write.target.columnKey,
      write.value,
    );
  }
  for (const clear of clears) {
    nextRows[clear.rowIndex] = setInvoiceCellValue(
      nextRows[clear.rowIndex],
      clear.columnKey,
      getEmptyInvoiceCellValue(clear.columnKey),
    );
  }

  return nextRows;
}

function clearCells(
  rows: readonly ConfirmableStockEntry[],
  cells: readonly InvoiceCellCoord[],
): readonly ConfirmableStockEntry[] {
  return applyWrites(
    rows,
    cells.map((cell) => ({
      target: cell,
      value: getEmptyInvoiceCellValue(cell.columnKey),
    })),
    [],
  );
}

function countNonEmptyCells(
  rows: readonly ConfirmableStockEntry[],
  cells: readonly InvoiceCellCoord[],
): number {
  return cells.filter((cell) => {
    const value = getInvoiceCellValue(rows[cell.rowIndex], cell.columnKey);
    return !isInvoiceCellValueEmpty(cell.columnKey, value);
  }).length;
}

function cellKey(cell: InvoiceCellCoord): string {
  return `${cell.rowIndex}:${cell.columnKey}`;
}

function columnOrder(columnKey: InvoiceColumnKey): number {
  return COLUMN_ORDER.get(columnKey) ?? Number.MAX_SAFE_INTEGER;
}

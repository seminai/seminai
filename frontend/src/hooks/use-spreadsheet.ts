import { useState, useCallback, useEffect, useRef } from 'react';

export interface CellCoord {
  readonly row: number;
  readonly col: number;
}

export interface SelectionBounds {
  readonly minRow: number;
  readonly maxRow: number;
  readonly minCol: number;
  readonly maxCol: number;
}

export interface PastePayload {
  readonly anchor: CellCoord;
  readonly data: readonly (readonly string[])[];
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function rangeKeys(start: CellCoord, end: CellCoord): string[] {
  const minR = Math.min(start.row, end.row);
  const maxR = Math.max(start.row, end.row);
  const minC = Math.min(start.col, end.col);
  const maxC = Math.max(start.col, end.col);
  const keys: string[] = [];
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      keys.push(cellKey(r, c));
    }
  }
  return keys;
}

/** Parse clipboard text (TSV from Excel, or CSV) into a 2D string array. */
export function parseClipboard(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  return lines.map((line) => line.split('\t'));
}

/** Serialize a 2D string matrix into TSV for clipboard export. */
export function serializeToTsv(values: readonly (readonly string[])[]): string {
  return values.map((row) => row.join('\t')).join('\n');
}

/** Compute the bounding rectangle of the current cell selection. */
export function getSelectionBounds(
  selected: ReadonlySet<string>,
): SelectionBounds | null {
  if (selected.size === 0) return null;

  let minRow = Infinity;
  let maxRow = -1;
  let minCol = Infinity;
  let maxCol = -1;

  for (const key of selected) {
    const [rowPart, colPart] = key.split(':');
    const row = Number(rowPart);
    const col = Number(colPart);
    if (Number.isNaN(row) || Number.isNaN(col)) continue;
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
    minCol = Math.min(minCol, col);
    maxCol = Math.max(maxCol, col);
  }

  if (minRow === Infinity) return null;
  return { minRow, maxRow, minCol, maxCol };
}

function isSpreadsheetContainerFocused(container: HTMLElement | null): boolean {
  const active = document.activeElement;
  if (!container) return false;
  return container.contains(active) || active === container;
}

function shouldUseSpreadsheetClipboard(
  container: HTMLElement | null,
  selected: ReadonlySet<string>,
): boolean {
  if (!isSpreadsheetContainerFocused(container)) return false;

  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement
  ) {
    const start = active.selectionStart;
    const end = active.selectionEnd;
    const hasTextSelection =
      start !== null && end !== null && start !== end;
    if (hasTextSelection) return false;
    if (selected.size > 1) return true;
  }

  return selected.size > 0;
}

interface UseSpreadsheetOptions {
  readonly rowCount: number;
  readonly colCount: number;
  readonly onPaste?: (payload: PastePayload) => void;
  readonly onCopy?: (bounds: SelectionBounds) => string | null;
}

export function useSpreadsheet({
  rowCount,
  colCount,
  onPaste,
  onCopy,
}: UseSpreadsheetOptions) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<CellCoord | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);

  const selectCell = useCallback(
    (row: number, col: number, shiftKey: boolean) => {
      const coord: CellCoord = { row, col };
      if (shiftKey && anchor) {
        setSelected(new Set(rangeKeys(anchor, coord)));
      } else {
        setAnchor(coord);
        setSelected(new Set([cellKey(row, col)]));
      }
    },
    [anchor],
  );

  const selectColumn = useCallback(
    (col: number, shiftKey: boolean) => {
      if (shiftKey && anchor) {
        const minC = Math.min(anchor.col, col);
        const maxC = Math.max(anchor.col, col);
        const keys: string[] = [];
        for (let r = 0; r < rowCount; r++) {
          for (let c = minC; c <= maxC; c++) {
            keys.push(cellKey(r, c));
          }
        }
        setSelected(new Set(keys));
      } else {
        setAnchor({ row: 0, col });
        const keys: string[] = [];
        for (let r = 0; r < rowCount; r++) {
          keys.push(cellKey(r, col));
        }
        setSelected(new Set(keys));
      }
    },
    [anchor, rowCount],
  );

  const selectRow = useCallback(
    (row: number, shiftKey: boolean) => {
      if (shiftKey && anchor) {
        const minR = Math.min(anchor.row, row);
        const maxR = Math.max(anchor.row, row);
        const keys: string[] = [];
        for (let r = minR; r <= maxR; r++) {
          for (let c = 0; c < colCount; c++) {
            keys.push(cellKey(r, c));
          }
        }
        setSelected(new Set(keys));
      } else {
        setAnchor({ row, col: 0 });
        const keys: string[] = [];
        for (let c = 0; c < colCount; c++) {
          keys.push(cellKey(row, c));
        }
        setSelected(new Set(keys));
      }
    },
    [anchor, colCount],
  );

  const selectAll = useCallback(() => {
    setAnchor({ row: 0, col: 0 });
    const keys: string[] = [];
    for (let r = 0; r < rowCount; r++) {
      for (let c = 0; c < colCount; c++) {
        keys.push(cellKey(r, c));
      }
    }
    setSelected(new Set(keys));
  }, [rowCount, colCount]);

  const isCellSelected = useCallback(
    (row: number, col: number) => selected.has(cellKey(row, col)),
    [selected],
  );

  const isColumnSelected = useCallback(
    (col: number) => {
      if (selected.size === 0) return false;
      for (let r = 0; r < rowCount; r++) {
        if (!selected.has(cellKey(r, col))) return false;
      }
      return true;
    },
    [selected, rowCount],
  );

  const isRowSelected = useCallback(
    (row: number) => {
      if (selected.size === 0) return false;
      for (let c = 0; c < colCount; c++) {
        if (!selected.has(cellKey(row, c))) return false;
      }
      return true;
    },
    [selected, colCount],
  );

  useEffect(() => {
    function handleCopy(e: ClipboardEvent) {
      if (!shouldUseSpreadsheetClipboard(containerRef.current, selected)) return;
      if (!onCopy) return;

      const bounds = getSelectionBounds(selected);
      if (!bounds) return;

      const tsv = onCopy(bounds);
      if (tsv == null) return;

      e.preventDefault();
      e.clipboardData?.setData('text/plain', tsv);
    }

    document.addEventListener('copy', handleCopy);
    return () => document.removeEventListener('copy', handleCopy);
  }, [selected, onCopy]);

  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      if (!shouldUseSpreadsheetClipboard(containerRef.current, selected)) return;
      if (!anchor || !onPaste) return;

      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;

      const parsed = parseClipboard(text);
      if (parsed.length === 0) return;

      onPaste({ anchor, data: parsed });
    }

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [anchor, onPaste, selected]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isSpreadsheetContainerFocused(containerRef.current)) return;

      if (e.key === 'Escape') {
        clearSelection();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        selectAll();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection, selectAll]);

  return {
    containerRef,
    selected,
    anchor,
    selectCell,
    selectColumn,
    selectRow,
    selectAll,
    clearSelection,
    isCellSelected,
    isColumnSelected,
    isRowSelected,
  };
}

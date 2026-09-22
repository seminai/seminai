import { useCallback, useState, type RefObject } from 'react';
import type { AgGridReact } from 'ag-grid-react';

export interface SelectionAggregates {
  readonly count: number;
  readonly sum: number;
  readonly average: number;
}

/**
 * Computes numeric aggregates (count, sum, average) from the current
 * AG Grid cell range selection. Returns `null` when no numeric values
 * are selected.
 *
 * Pass `onCellSelectionChanged` to the `<AgGridReact>` component's
 * `onCellSelectionChanged` prop.
 */
export function useSelectionAggregates<TData>(
  gridRef: RefObject<AgGridReact<TData> | null>,
): {
  readonly aggregates: SelectionAggregates | null;
  readonly onCellSelectionChanged: () => void;
} {
  const [aggregates, setAggregates] = useState<SelectionAggregates | null>(null);

  const onCellSelectionChanged = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) {
      setAggregates(null);
      return;
    }

    const ranges = api.getCellRanges();
    if (!ranges || ranges.length === 0) {
      setAggregates(null);
      return;
    }

    const values: number[] = [];

    for (const range of ranges) {
      const startIdx = range.startRow?.rowIndex ?? 0;
      const endIdx = range.endRow?.rowIndex ?? 0;
      const top = Math.min(startIdx, endIdx);
      const bottom = Math.max(startIdx, endIdx);

      for (let rowIdx = top; rowIdx <= bottom; rowIdx++) {
        const rowNode = api.getDisplayedRowAtIndex(rowIdx);
        if (!rowNode?.data) continue;

        const record = rowNode.data as Record<string, unknown>;
        for (const col of range.columns) {
          const field = col.getColDef().field;
          if (!field) continue;
          const raw = record[field];
          const num = typeof raw === 'number' ? raw : parseFloat(String(raw));
          if (!Number.isNaN(num)) values.push(num);
        }
      }
    }

    if (values.length === 0) {
      setAggregates(null);
      return;
    }

    const sum = values.reduce((acc, v) => acc + v, 0);
    setAggregates({
      count: values.length,
      sum,
      average: sum / values.length,
    });
  }, [gridRef]);

  return { aggregates, onCellSelectionChanged };
}

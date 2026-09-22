import { useMemo } from 'react';
import type { ColDef, ValueSetterParams } from 'ag-grid-community';
import {
  applyCellValue,
  getColumnsForCategory,
} from '@/lib/ag-grid/invoice-columns';
import { formatProductCategoryLabel } from '@/lib/invoice-cell-values';
import type { ExtractionCategoryOption } from '@/lib/extraction-product-category';
import type { ConfirmableStockEntry, ResolvedCategory } from '@/types/extraction';

export function useInvoiceExcelColumnDefs(
  isEditable: boolean,
  isSaving: boolean,
  category: ResolvedCategory = 'invoice',
  isManufacturing = false,
  categoryOptions: readonly ExtractionCategoryOption[] = [],
): {
  readonly columnDefs: ColDef<ConfirmableStockEntry>[];
  readonly defaultColDef: ColDef<ConfirmableStockEntry>;
} {
  const editable = isEditable && !isSaving;

  const columnDefs = useMemo<ColDef<ConfirmableStockEntry>[]>(
    () =>
      getColumnsForCategory(category, isManufacturing).map((col) => {
        const base: ColDef<ConfirmableStockEntry> = {
          colId: col.key,
          field: col.key,
          headerName: col.label,
          minWidth: col.minWidth,
          editable,
          singleClickEdit: editable,
          sortable: true,
          filter: true,
          resizable: true,
          valueSetter: (params: ValueSetterParams<ConfirmableStockEntry>) => {
            if (!params.data) return false;
            const raw = params.newValue == null ? '' : String(params.newValue);
            const updated = applyCellValue(params.data, col.key, raw);
            Object.assign(params.data as object, updated);
            return true;
          },
        };
        if (col.key === 'productCategory' && categoryOptions.length > 0) {
          return {
            ...base,
            cellEditor: isManufacturing ? 'agTextCellEditor' : 'agSelectCellEditor',
            cellEditorParams: isManufacturing
              ? undefined
              : { values: categoryOptions.map((option) => option.value) },
            valueFormatter: (params) =>
              formatProductCategoryLabel(String(params.value ?? ''), categoryOptions),
          };
        }
        return base;
      }),
    [category, categoryOptions, editable, isManufacturing],
  );

  const defaultColDef = useMemo<ColDef<ConfirmableStockEntry>>(
    () => ({
      flex: 1,
      minWidth: 100,
      editable,
      singleClickEdit: editable,
    }),
    [editable],
  );

  return { columnDefs, defaultColDef };
}

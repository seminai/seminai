import { flexRender, type ColumnDef, type CellContext } from '@tanstack/react-table';
import type { ColDef, ICellRendererParams, IHeaderParams } from 'ag-grid-community';
import { getSafeColumnLabel } from '@/lib/safe-display';

/**
 * Minimal subset of the TanStack CellContext our cell renderers rely on.
 * We build a compatible object from the AG Grid params so existing `cell`
 * functions can be reused as-is.
 */
interface MinimalCellContext<TData, TValue> {
  readonly row: {
    readonly original: TData;
    readonly index: number;
    readonly getValue: (columnId: string) => unknown;
    readonly getIsSelected: () => boolean;
    readonly toggleSelected: (value?: boolean) => void;
  };
  readonly column: { readonly id: string };
  readonly getValue: () => TValue;
  readonly renderValue: () => TValue;
  readonly cell: unknown;
  readonly table: unknown;
}

function resolveHeader<TData>(
  column: ColumnDef<TData, unknown>,
  columnId: string,
  columnLabels: Record<string, string>,
): string {
  const rawHeader = column.header;
  if (typeof rawHeader === 'string' && rawHeader.length > 0) return rawHeader;
  return getSafeColumnLabel(columnId, columnLabels);
}

function resolveField<TData>(column: ColumnDef<TData, unknown>): string | undefined {
  const candidate = column as { accessorKey?: unknown };
  return typeof candidate.accessorKey === 'string' ? candidate.accessorKey : undefined;
}

function resolveColId<TData>(column: ColumnDef<TData, unknown>, index: number): string {
  if (typeof column.id === 'string' && column.id.length > 0) return column.id;
  const field = resolveField(column);
  if (field) return field;
  return `col-${index}`;
}

function renderCellWithDef<TData>(
  column: ColumnDef<TData, unknown>,
  params: ICellRendererParams<TData>,
): React.ReactNode {
  const cellRenderer = column.cell;
  if (!cellRenderer) return params.value as React.ReactNode;

  const fallbackContext: MinimalCellContext<TData, unknown> = {
    row: {
      original: params.data as TData,
      index: params.node?.rowIndex ?? 0,
      getValue: (columnId) => {
        const record = params.data as Record<string, unknown> | undefined;
        return record ? record[columnId] : undefined;
      },
      getIsSelected: () => Boolean(params.node?.isSelected()),
      toggleSelected: (value?: boolean) => {
        params.node?.setSelected(value ?? !params.node?.isSelected());
      },
    },
    column: { id: params.colDef?.colId ?? '' },
    getValue: () => params.value,
    renderValue: () => params.value,
    cell: undefined,
    table: undefined,
  };

  return flexRender(
    cellRenderer,
    fallbackContext as unknown as CellContext<TData, unknown>,
  );
}

/**
 * Convert a TanStack `ColumnDef` array into AG Grid `ColDef[]`, preserving:
 * - column id / accessor
 * - header label (with fallback to columnLabels)
 * - custom cell renderers
 * - size hint (px) when provided
 * - enableSorting / enableHiding flags
 *
 * Advanced TanStack features (faceted filters, meta.widthPercent, etc.) are
 * intentionally dropped: AG Grid provides its own native replacements.
 */
export function columnDefsToColDefs<TData>(
  columns: readonly ColumnDef<TData, unknown>[],
  columnLabels: Record<string, string> = {},
): ColDef<TData>[] {
  return columns
    .filter((column) => (column.id ?? '') !== 'select')
    .map((column, index) => {
      const colId = resolveColId(column, index);
      const field = resolveField(column);

      const colDef: ColDef<TData> = {
        colId,
        field: field as ColDef<TData>['field'],
        headerName: resolveHeader(column, colId, columnLabels),
        sortable: column.enableSorting !== false,
        filter: true,
        floatingFilter: false,
        resizable: true,
        editable: false,
        lockVisible: column.enableHiding === false,
      };

      const size = (column as { size?: number }).size;
      if (typeof size === 'number') {
        colDef.width = size;
      }

      if (column.cell !== undefined) {
        colDef.cellRenderer = (params: ICellRendererParams<TData>) =>
          renderCellWithDef(column, params);
      }

      return colDef;
    });
}

/**
 * Simple text header renderer that just exposes the `displayName`. Kept for
 * symmetry with TanStack's flexRender; AG Grid already handles the default.
 */
export function defaultHeaderRenderer(params: IHeaderParams): React.ReactNode {
  return params.displayName;
}

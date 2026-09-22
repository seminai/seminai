import type { MouseEvent, ReactNode } from 'react';
import type {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';

export interface BulkAction<TData = unknown> {
  readonly label: string;
  readonly icon: ReactNode;
  readonly onClick: (rows: readonly TData[]) => void;
  readonly variant?: 'default' | 'destructive' | 'outline' | 'ghost';
}

export interface DataTableCellClassContext {
  readonly columnId: string;
  readonly isFirstVisibleCell: boolean;
  readonly isLastVisibleCell: boolean;
}

export interface StickyColumnConfig {
  readonly left: string;
  readonly width?: string;
}

export interface DataTableProps<TData> {
  readonly data: readonly TData[];
  readonly columns: ColumnDef<TData, unknown>[];
  readonly columnLabels?: Record<string, string>;
  readonly bulkActions?: readonly BulkAction<TData>[];
  readonly onRowClick?: (row: TData, event: MouseEvent<HTMLTableRowElement>) => void;
  readonly onShare?: () => void;
  readonly defaultVisibility?: VisibilityState;
  readonly exportSection?: string;
  readonly columnFilters?: ColumnFiltersState;
  readonly onColumnFiltersChange?: (filters: ColumnFiltersState) => void;
  readonly sorting?: SortingState;
  readonly onSortingChange?: (sorting: SortingState) => void;
  readonly onClearFilters?: () => void;
  readonly totalCount?: number;
  readonly searchValue?: string;
  readonly onSearchValueChange?: (value: string) => void;
  readonly searchPlaceholder?: string;
  readonly manualPagination?: boolean;
  readonly manualSorting?: boolean;
  readonly manualFiltering?: boolean;
  readonly pageCount?: number;
  readonly pagination?: PaginationState;
  readonly onPaginationChange?: (pagination: PaginationState) => void;
  readonly columnWidthMode?: 'fixed' | 'percent';
  readonly showSelectionColumn?: boolean;
  readonly getRowClassName?: (originalRow: TData) => string | undefined;
  readonly getCellClassName?: (
    originalRow: TData,
    context: DataTableCellClassContext,
  ) => string | undefined;
  readonly secondaryFooter?: ReactNode;
  readonly toolbarStatsText?: (count: number) => string;
  readonly toolbarRightSlot?: ReactNode;
  readonly getRowId?: (originalRow: TData, index: number) => string;
  readonly tableClassName?: string;
  readonly minTableWidth?: string;
  readonly stickyColumns?: Readonly<Record<string, StickyColumnConfig>>;
  readonly filterOptions?: Readonly<Record<string, readonly string[]>>;
  readonly selectionResetKey?: number;
  readonly extraExportColumns?: ReadonlyArray<{
    readonly label: string;
    readonly getValue: (row: TData) => unknown;
  }>;
}

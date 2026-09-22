import { useState, useCallback, type ReactNode } from 'react';
import type { Table } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { ColumnVisibilityPanel } from '@/components/molecules/column-visibility-panel';
import { ToolbarFilterRow } from '@/components/molecules/toolbar-filter-row';
import { ToolbarSortPopover } from '@/components/molecules/toolbar-sort-popover';
import { getSafeColumnLabel, sanitizeUserFacingValue } from '@/lib/safe-display';
import { formatDate } from '@/lib/format-date';
import { ListFilter, Share2, X } from 'lucide-react';

function formatFilterValue(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const range = value as { from?: string; to?: string };
    if (range.from || range.to) {
      if (range.from && range.to && range.from === range.to) return formatDate(range.from);
      const fromLabel = range.from ? formatDate(range.from) : '…';
      const toLabel = range.to ? formatDate(range.to) : '…';
      return `${fromLabel} → ${toLabel}`;
    }
  }
  if (Array.isArray(value)) {
    if (value.length <= 2) {
      return value.map((v) => sanitizeUserFacingValue(String(v), 'Valore nascosto')).join(', ');
    }
    return `${value.length} selezionati`;
  }
  return sanitizeUserFacingValue(String(value ?? ''), 'Valore nascosto');
}

interface DataTableToolbarProps<TData> {
  readonly table: Table<TData>;
  readonly totalCount: number;
  /** When set, replaces the default "{n} file totali" label (e.g. job operations). */
  readonly statsText?: (count: number) => string;
  /** When set, replaces the right-side stats text entirely (e.g. with an action button). */
  readonly rightSlot?: ReactNode;
  readonly onShare?: () => void;
  readonly columnLabels?: Record<string, string>;
  readonly onClearAll?: () => void;
  readonly searchValue?: string;
  readonly onSearchValueChange?: (value: string) => void;
  readonly searchPlaceholder?: string;
}

let nextFilterId = 0;

export function DataTableToolbar<TData>({
  table,
  totalCount,
  statsText,
  rightSlot,
  onShare,
  columnLabels = {},
  onClearAll,
  searchValue,
  onSearchValueChange,
  searchPlaceholder = 'Cerca...',
}: DataTableToolbarProps<TData>) {
  const [filterRows, setFilterRows] = useState<string[]>([]);
  const isFiltered = table.getState().columnFilters.length > 0;
  const isSorted = table.getState().sorting.length > 0;

  const addFilterRow = useCallback(() => {
    setFilterRows((prev) => [...prev, `filter-${++nextFilterId}`]);
  }, []);

  const removeFilterRow = useCallback((id: string) => {
    setFilterRows((prev) => prev.filter((fId) => fId !== id));
  }, []);

  function handleFilterClick() {
    if (filterRows.length === 0) {
      addFilterRow();
    } else {
      setFilterRows([]);
      table.resetColumnFilters();
    }
  }

  return (
    <div className="border-b">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2 sm:px-4">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <ColumnVisibilityPanel
            table={table}
            columnLabels={columnLabels}
          />

          <ToolbarSortPopover table={table} columnLabels={columnLabels} />

          <Button
            variant={filterRows.length > 0 ? 'secondary' : 'outline'}
            size="sm"
            className="h-9 gap-1.5"
            onClick={handleFilterClick}
          >
            <ListFilter className="h-4 w-4" />
            Filtra
          </Button>

          {isFiltered && filterRows.length === 0 && (
            <Separator orientation="vertical" className="mx-1 h-5" />
          )}

          {isFiltered &&
            filterRows.length === 0 &&
            table.getState().columnFilters.map((filter) => {
              const label = getSafeColumnLabel(filter.id, columnLabels);
              return (
                <Badge
                  key={filter.id}
                  variant="secondary"
                  className="gap-1 pr-1 text-xs font-normal"
                >
                  {label}: {formatFilterValue(filter.value)}
                  <button
                    type="button"
                    className="ml-0.5 rounded-sm p-0.5 hover:bg-accent"
                    onClick={() => table.getColumn(filter.id)?.setFilterValue(undefined)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}

          {filterRows.length > 0 && (
            <>
              <Separator orientation="vertical" className="mx-1 h-5" />
              {filterRows.map((id) => (
                <ToolbarFilterRow
                  key={id}
                  table={table}
                  columnLabels={columnLabels}
                  filterId={id}
                  onRemove={() => removeFilterRow(id)}
                />
              ))}
            </>
          )}
          {onSearchValueChange && (
            <>
              <Separator orientation="vertical" className="mx-1 h-5" />
              <Input
                value={searchValue ?? ''}
                onChange={(event) => onSearchValueChange(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 w-40 sm:w-64"
              />
            </>
          )}

          {(isFiltered || isSorted) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 shrink-0 gap-1 text-xs"
              onClick={() => {
                table.resetColumnFilters();
                table.resetSorting();
                setFilterRows([]);
                onClearAll?.();
              }}
            >
              <X className="h-3 w-3" />
              Reset
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {rightSlot ?? (
            <span className="whitespace-nowrap text-sm text-muted-foreground">
              {statsText ? statsText(totalCount) : `${totalCount} file totali`}
            </span>
          )}
          {onShare && (
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <Share2 className="h-4 w-4" />
              Condividi
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

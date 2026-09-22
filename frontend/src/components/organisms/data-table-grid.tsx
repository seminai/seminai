import type { CSSProperties, MouseEvent } from 'react';
import { flexRender, type ColumnDef, type Table } from '@tanstack/react-table';
import { ColumnFilter } from '@/components/molecules/column-filter';
import { DateRangeFilter } from '@/components/molecules/date-range-filter';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getSafeColumnLabel } from '@/lib/safe-display';
import { cn } from '@/lib/utils';
import { renderDataTableCell } from './data-table-cell';
import type { DataTableCellClassContext } from './data-table-types';

interface DataTableGridProps<TData> {
  readonly table: Table<TData>;
  readonly allColumns: readonly ColumnDef<TData, unknown>[];
  readonly columnLabels: Readonly<Record<string, string>>;
  readonly columnWidthMode: 'fixed' | 'percent';
  readonly tableClassName?: string;
  readonly minTableWidth?: string;
  readonly filterOptions?: Readonly<Record<string, readonly string[]>>;
  readonly onRowClick?: (row: TData, event: MouseEvent<HTMLTableRowElement>) => void;
  readonly getRowClassName?: (row: TData) => string | undefined;
  readonly getCellClassName?: (row: TData, context: DataTableCellClassContext) => string | undefined;
  readonly getStickyStyle: (columnId: string) => CSSProperties | undefined;
}

/** Render the head and body for a configured TanStack table. */
export function DataTableGrid<TData>(props: DataTableGridProps<TData>): React.JSX.Element {
  const { table } = props;
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table data-slot="table" className={cn('w-full caption-bottom text-xs sm:text-sm', 'table-fixed', props.tableClassName)} style={{ minWidth: props.minTableWidth }}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const columnId = header.column.id;
                const percent = header.column.columnDef.meta?.widthPercent as number | undefined;
                const usePercent = props.columnWidthMode === 'percent' && percent != null;
                const stickyStyle = props.getStickyStyle(columnId);
                return (
                  <TableHead
                    key={header.id}
                    style={{ width: stickyStyle?.width ?? (usePercent ? `${percent}%` : `${header.getSize()}px`), ...stickyStyle }}
                    className={cn('sticky top-0 z-30 h-10 min-w-0 overflow-hidden bg-background', stickyStyle && 'z-40')}
                  >
                    {header.isPlaceholder ? null : header.column.getCanFilter() ? (
                      header.column.columnDef.meta?.filterType === 'dateRange' ? (
                        <DateRangeFilter column={header.column} title={getSafeColumnLabel(columnId, props.columnLabels)} />
                      ) : (
                        <ColumnFilter column={header.column} title={getSafeColumnLabel(columnId, props.columnLabels)} externalOptions={props.filterOptions?.[columnId]} />
                      )
                    ) : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow><TableCell colSpan={props.allColumns.length} className="h-24 text-center text-muted-foreground">Nessun risultato.</TableCell></TableRow>
          ) : table.getRowModel().rows.map((row) => {
            const visibleCells = row.getVisibleCells();
            return (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
                className={cn('transition-colors', row.getIsSelected() && 'bg-accent/50', props.onRowClick && 'cursor-pointer', props.getRowClassName?.(row.original))}
                onClick={(event) => props.onRowClick?.(row.original, event)}
              >
                {visibleCells.map((cell, cellIndex) => {
                  const stickyStyle = props.getStickyStyle(cell.column.id);
                  return (
                    <TableCell
                      key={cell.id}
                      style={stickyStyle}
                      className={cn(
                        stickyStyle && ['sticky z-20 border-r', row.getIsSelected() ? 'bg-accent' : 'bg-background'],
                        props.getCellClassName?.(row.original, {
                          columnId: cell.column.id,
                          isFirstVisibleCell: cellIndex === 0,
                          isLastVisibleCell: cellIndex === visibleCells.length - 1,
                        }),
                      )}
                    >
                      {renderDataTableCell(cell)}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </table>
    </div>
  );
}

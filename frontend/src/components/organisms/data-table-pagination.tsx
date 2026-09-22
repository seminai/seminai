import type { ReactNode } from 'react';
import type { PaginationState, Table } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DataTablePaginationProps<TData> {
  readonly table: Table<TData>;
  readonly pagination: PaginationState;
  readonly onPaginationChange: (pagination: PaginationState) => void;
  readonly secondaryFooter?: ReactNode;
}

/** Pagination controls and optional table footer content. */
export function DataTablePagination<TData>({
  table,
  pagination,
  onPaginationChange,
  secondaryFooter,
}: DataTablePaginationProps<TData>): React.JSX.Element {
  return (
    <div className="border-t">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
          <span>Righe per pagina</span>
          <Select
            value={String(pagination.pageSize)}
            onValueChange={(value) => onPaginationChange({ pageIndex: 0, pageSize: Number(value) })}
          >
            <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[10, 25, 50].map((size) => (
                <SelectItem key={size} value={String(size)}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground sm:text-sm">
            Pagina {pagination.pageIndex + 1} di {Math.max(table.getPageCount(), 1)}
          </span>
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {secondaryFooter ? <div className="border-t px-4 py-2">{secondaryFooter}</div> : null}
    </div>
  );
}

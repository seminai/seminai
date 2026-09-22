import type { Table } from '@tanstack/react-table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { getSafeColumnLabel } from '@/lib/safe-display';
import { cn } from '@/lib/utils';

interface ToolbarSortPopoverProps<TData> {
  readonly table: Table<TData>;
  readonly columnLabels?: Record<string, string>;
}

export function ToolbarSortPopover<TData>({
  table,
  columnLabels = {},
}: ToolbarSortPopoverProps<TData>) {
  const sortableColumns = table
    .getAllColumns()
    .filter((col) => col.getCanSort() && col.id !== 'select');

  const currentSort = table.getState().sorting[0];
  const isSorted = !!currentSort;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant={isSorted ? 'secondary' : 'outline'}
            size="sm"
            className="h-9 gap-1.5"
          />
        }
      >
        <ArrowUpDown className="h-4 w-4" />
        Ordina
        {isSorted && (
          <span className="text-xs text-muted-foreground">
            ({getSafeColumnLabel(currentSort.id, columnLabels)})
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Ordina per
        </div>
        <Separator className="my-1" />
        {sortableColumns.map((col) => {
          const isActive = currentSort?.id === col.id;
          const isDesc = isActive && currentSort.desc;
          const label = getSafeColumnLabel(col.id, columnLabels);
          const Icon = isActive ? (isDesc ? ArrowDown : ArrowUp) : ArrowUpDown;

          return (
            <Button
              key={col.id}
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 w-full justify-start gap-2 text-sm',
                isActive && 'bg-accent',
              )}
              onClick={() => {
                if (!isActive) {
                  col.toggleSorting(false);
                } else if (!isDesc) {
                  col.toggleSorting(true);
                } else {
                  table.resetSorting();
                }
              }}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </Button>
          );
        })}
        {isSorted && (
          <>
            <Separator className="my-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start text-sm text-muted-foreground"
              onClick={() => table.resetSorting()}
            >
              Rimuovi ordinamento
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

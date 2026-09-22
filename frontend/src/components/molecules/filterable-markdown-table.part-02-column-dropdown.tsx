import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import type { ColumnDropdownProps } from './filterable-markdown-table.part-01-sort-dir';

export const ColumnDropdown = forwardRef<HTMLDivElement, ColumnDropdownProps>(
  function ColumnDropdown(
    { colIdx, values, activeFilter, searchTerm, currentSortDir, onFilter, onSearch, onSort, onClear },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className="absolute left-0 top-full z-10 mt-1 min-w-[180px] rounded-md border bg-popover shadow-md"
      >
        {/* Sort buttons */}
        <div className="flex gap-1 border-b px-2 py-1.5">
          <button
            type="button"
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[11px] transition-colors hover:bg-accent',
              currentSortDir === 'asc' ? 'bg-accent font-semibold text-primary' : '',
            )}
            onClick={() => onSort(currentSortDir === 'asc' ? null : 'asc')}
          >
            <ArrowUp className="h-3 w-3" />
            A-Z
          </button>
          <button
            type="button"
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[11px] transition-colors hover:bg-accent',
              currentSortDir === 'desc' ? 'bg-accent font-semibold text-primary' : '',
            )}
            onClick={() => onSort(currentSortDir === 'desc' ? null : 'desc')}
          >
            <ArrowDown className="h-3 w-3" />
            Z-A
          </button>
        </div>

        {/* Search input */}
        <div className="border-b px-2 py-1.5">
          <div className="flex items-center gap-1.5 rounded border bg-background px-2 py-1">
            <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
            <input
              type="text"
              className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              placeholder="Cerca..."
              value={searchTerm}
              onChange={(e) => onSearch(colIdx, e.target.value)}
            />
          </div>
        </div>

        {/* Value list */}
        <div className="max-h-36 overflow-y-auto">
          <button
            type="button"
            className={cn(
              'block w-full px-3 py-1.5 text-left text-xs hover:bg-accent',
              !activeFilter ? 'font-semibold text-primary' : '',
            )}
            onClick={() => onFilter(colIdx, '')}
          >
            Tutti
          </button>
          {values.map((val) => (
            <button
              key={val}
              type="button"
              className={cn(
                'block w-full px-3 py-1.5 text-left text-xs hover:bg-accent',
                activeFilter === val ? 'font-semibold text-primary' : '',
              )}
              onClick={() => onFilter(colIdx, val)}
            >
              {val}
            </button>
          ))}
        </div>

        {/* Clear column filters */}
        {(activeFilter || searchTerm || currentSortDir) && (
          <div className="border-t px-2 py-1.5">
            <button
              type="button"
              className="w-full rounded px-2 py-1 text-center text-[11px] text-destructive transition-colors hover:bg-destructive/10"
              onClick={onClear}
            >
              Pulisci filtri
            </button>
          </div>
        )}
      </div>
    );
  },
);

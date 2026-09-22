import { useState, useMemo } from 'react';
import type { Column } from '@tanstack/react-table';
import type { DateRange } from 'react-day-picker';
import { ArrowUp, ArrowDown, ListFilter, X } from 'lucide-react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { SortIndicator } from '@/components/atoms/sort-indicator';
import {
  formatDate,
  fromIsoDateString,
  toIsoDateString,
} from '@/lib/format-date';
import { cn } from '@/lib/utils';

export interface DateRangeFilterValue {
  readonly from?: string;
  readonly to?: string;
}

interface DateRangeFilterProps<TData> {
  readonly column: Column<TData, unknown>;
  readonly title: string;
}

export function DateRangeFilter<TData>({
  column,
  title,
}: DateRangeFilterProps<TData>) {
  const [open, setOpen] = useState(false);
  const filterValue = column.getFilterValue() as DateRangeFilterValue | undefined;
  const isSorted = column.getIsSorted();

  const selected = useMemo<DateRange | undefined>(() => {
    if (!filterValue) return undefined;
    const from = filterValue.from ? fromIsoDateString(filterValue.from) : undefined;
    const to = filterValue.to ? fromIsoDateString(filterValue.to) : undefined;
    if (!from && !to) return undefined;
    return { from, to };
  }, [filterValue]);

  const isFiltered = Boolean(filterValue?.from || filterValue?.to);

  function handleSelect(range: DateRange | undefined) {
    if (!range || (!range.from && !range.to)) {
      column.setFilterValue(undefined);
      return;
    }
    const next: DateRangeFilterValue = {
      from: range.from ? toIsoDateString(range.from) : undefined,
      to: range.to ? toIsoDateString(range.to) : undefined,
    };
    column.setFilterValue(next);
  }

  function applyShortcut(daysBack: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const from = new Date(today);
    from.setDate(from.getDate() - daysBack);
    column.setFilterValue({
      from: toIsoDateString(from),
      to: toIsoDateString(today),
    } satisfies DateRangeFilterValue);
  }

  function applyToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const iso = toIsoDateString(today);
    column.setFilterValue({ from: iso, to: iso } satisfies DateRangeFilterValue);
  }

  function clearFilter() {
    column.setFilterValue(undefined);
  }

  const summary = useMemo(() => {
    if (!filterValue?.from && !filterValue?.to) return null;
    if (filterValue.from && filterValue.to && filterValue.from === filterValue.to) {
      return formatDate(filterValue.from);
    }
    const fromLabel = filterValue.from ? formatDate(filterValue.from) : '…';
    const toLabel = filterValue.to ? formatDate(filterValue.to) : '…';
    return `${fromLabel} → ${toLabel}`;
  }, [filterValue]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={cn('-ml-3 h-8 gap-1', isFiltered && 'text-primary')}
          />
        }
      >
        {title}
        <SortIndicator direction={isSorted} />
        {isFiltered && <ListFilter className="h-3 w-3 text-primary" />}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex items-center gap-1 border-b px-2 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => column.toggleSorting(false)}
          >
            <ArrowUp className="mr-1 h-3 w-3" />
            Crescente
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => column.toggleSorting(true)}
          >
            <ArrowDown className="mr-1 h-3 w-3" />
            Decrescente
          </Button>
        </div>

        <div className="flex flex-wrap gap-1 border-b px-2 py-1.5">
          <Button variant="outline" size="xs" onClick={applyToday}>
            Oggi
          </Button>
          <Button variant="outline" size="xs" onClick={() => applyShortcut(7)}>
            7 giorni
          </Button>
          <Button variant="outline" size="xs" onClick={() => applyShortcut(30)}>
            30 giorni
          </Button>
        </div>

        <Calendar
          mode="range"
          selected={selected}
          onSelect={handleSelect}
          numberOfMonths={2}
          defaultMonth={selected?.from}
        />

        {summary && (
          <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
            {summary}
          </div>
        )}

        {isFiltered && (
          <>
            <Separator />
            <div className="p-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full text-xs"
                onClick={clearFilter}
              >
                <X className="mr-1 h-3 w-3" />
                Rimuovi filtro
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

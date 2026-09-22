import { useState, useMemo } from 'react';
import type { Column } from '@tanstack/react-table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { SortIndicator } from '@/components/atoms/sort-indicator';
import { ListFilter, ArrowUp, ArrowDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ColumnFilterProps<TData> {
  readonly column: Column<TData, unknown>;
  readonly title: string;
  /** When provided, these values are used instead of faceted values (for server-side filtering). */
  readonly externalOptions?: readonly string[];
}

export function ColumnFilter<TData>({
  column,
  title,
  externalOptions,
}: ColumnFilterProps<TData>) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const facetedValues = column.getFacetedUniqueValues();
  const filterValue = (column.getFilterValue() as string[]) ?? [];

  const sortedUniqueValues = useMemo(() => {
    const faceted = Array.from(facetedValues.keys())
      .filter((value): value is string | number => value != null && value !== '')
      .map((value) => String(value).trim())
      .filter((value) => value.length > 0);
    const external = (externalOptions ?? [])
      .map((value) => String(value).trim())
      .filter((value) => value.length > 0);
    const values = Array.from(new Set([...external, ...faceted])).sort((left, right) =>
      left.localeCompare(right, 'it-IT', { sensitivity: 'base' }),
    );

    if (!search) return values;
    const lowerSearch = search.toLowerCase();
    return values.filter((v) => String(v).toLowerCase().includes(lowerSearch));
  }, [facetedValues, externalOptions, search]);

  const isFiltered = filterValue.length > 0;
  const isSorted = column.getIsSorted();

  function toggleValue(value: string) {
    const next = filterValue.includes(value)
      ? filterValue.filter((v) => v !== value)
      : [...filterValue, value];
    column.setFilterValue(next.length > 0 ? next : undefined);
  }

  function clearFilter() {
    column.setFilterValue(undefined);
    setSearch('');
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              '-ml-3 h-8 gap-1',
              isFiltered && 'text-primary',
            )}
          />
        }
      >
        {title}
        <SortIndicator direction={isSorted} />
        {isFiltered && (
          <ListFilter className="h-3 w-3 text-primary" />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
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

        <div className="p-2">
          <Input
            placeholder="Cerca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <Separator />

        <div className="max-h-48 overflow-y-auto p-2">
          {sortedUniqueValues.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Nessun risultato
            </p>
          ) : (
            sortedUniqueValues.map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={filterValue.includes(value)}
                  onCheckedChange={() => toggleValue(value)}
                />
                <span className="truncate">{value}</span>
                {!externalOptions && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {facetedValues.get(value) ?? 0}
                  </span>
                )}
              </label>
            ))
          )}
        </div>

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

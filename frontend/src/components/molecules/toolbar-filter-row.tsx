import { useState } from 'react';
import type { Table } from '@tanstack/react-table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ChevronDown, Trash2 } from 'lucide-react';
import { FILTER_CONDITIONS } from '@/config/constants';
import type { FilterCondition } from '@/config/constants';
import { getSafeColumnLabel } from '@/lib/safe-display';

interface ToolbarFilterRowProps<TData> {
  readonly table: Table<TData>;
  readonly columnLabels: Record<string, string>;
  readonly filterId: string;
  readonly onRemove: () => void;
}

function matchesCondition(value: string, search: string, condition: FilterCondition): boolean {
  const v = value.toLowerCase();
  const s = search.toLowerCase();
  if (condition === 'Contiene') return v.includes(s);
  if (condition === 'Uguale a') return v === s;
  if (condition === 'Inizia con') return v.startsWith(s);
  return v.endsWith(s);
}

export function ToolbarFilterRow<TData>({
  table,
  columnLabels,
  filterId,
  onRemove,
}: ToolbarFilterRowProps<TData>) {
  const filterableColumns = table
    .getAllColumns()
    .filter((col) => col.getCanFilter() && col.id !== 'select');

  const [selectedColumnId, setSelectedColumnId] = useState(
    filterableColumns[0]?.id ?? '',
  );
  const [condition, setCondition] = useState<FilterCondition>('Contiene');
  const [search, setSearch] = useState('');

  const column = table.getColumn(selectedColumnId);

  function applyFilter(newSearch: string, newCondition: FilterCondition, newColId: string) {
    const col = table.getColumn(newColId);
    if (!col) return;

    if (newColId !== selectedColumnId) {
      const prevCol = table.getColumn(selectedColumnId);
      prevCol?.setFilterValue(undefined);
    }

    if (!newSearch) {
      col.setFilterValue(undefined);
      return;
    }

    const faceted = col.getFacetedUniqueValues();
    const matching = Array.from(faceted.keys())
      .filter((v): v is string => v != null)
      .filter((v) => matchesCondition(String(v), newSearch, newCondition));

    col.setFilterValue(matching.length > 0 ? matching : ['__no_match__']);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    applyFilter(value, condition, selectedColumnId);
  }

  function handleColumnChange(colId: string) {
    const prevCol = table.getColumn(selectedColumnId);
    prevCol?.setFilterValue(undefined);
    setSelectedColumnId(colId);
    setSearch('');
  }

  function handleConditionChange(c: FilterCondition) {
    setCondition(c);
    applyFilter(search, c, selectedColumnId);
  }

  function handleRemove() {
    column?.setFilterValue(undefined);
    onRemove();
  }

  const placeholder = `Cerca tra ${getSafeColumnLabel(selectedColumnId, columnLabels).toLowerCase()}...`;

  return (
    <div className="flex items-center gap-2" data-filter-id={filterId}>
      <div className="flex h-9 items-center gap-0 rounded-md border bg-muted/40 pl-1 pr-1">
        <DropdownSelect
          value={getSafeColumnLabel(selectedColumnId, columnLabels)}
          options={filterableColumns.map((col) => ({
            value: col.id,
            label: getSafeColumnLabel(col.id, columnLabels),
          }))}
          onSelect={handleColumnChange}
        />

        <Separator orientation="vertical" className="h-5" />

        <DropdownSelect
          value={condition}
          options={FILTER_CONDITIONS.map((c) => ({ value: c, label: c }))}
          onSelect={(v) => handleConditionChange(v as FilterCondition)}
        />

        <Separator orientation="vertical" className="h-5" />

        <Input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={placeholder}
          className="h-8 w-56 rounded-sm border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0"
        />
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleRemove}
        className="h-9 w-9 rounded-md text-muted-foreground"
        title="Rimuovi filtro"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function DropdownSelect({
  value,
  options,
  onSelect,
}: {
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onSelect: (value: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 rounded-sm px-3 text-sm font-medium"
          />
        }
      >
        {value}
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="start">
        {options.map((opt) => (
          <Button
            key={opt.value}
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start text-sm"
            onClick={() => onSelect(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

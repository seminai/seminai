import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ArrowUp, ArrowDown, ChevronDown, Filter, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  sanitizeUserFacingColumnLabel,
  sanitizeUserFacingValue,
} from '@/lib/safe-display';

type SortDir = 'asc' | 'desc' | null;

interface FilterableMarkdownTableProps {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export function sanitizeMarkdownTableData(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): { headers: string[]; rows: string[][] } {
  return {
    headers: headers.map((header) => sanitizeUserFacingColumnLabel(header)),
    rows: rows.map((row) =>
      row.map((cell) => sanitizeUserFacingValue(cell, '[identificativo nascosto]')),
    ),
  };
}

export function FilterableMarkdownTable({ headers, rows }: FilterableMarkdownTableProps) {
  const [filters, setFilters] = useState<Record<number, string>>({});
  const [searchTerms, setSearchTerms] = useState<Record<number, string>>({});
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [openFilter, setOpenFilter] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenFilter(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const { headers: tableHeaders, rows: tableRows } = useMemo(
    () => sanitizeMarkdownTableData(headers, rows),
    [headers, rows],
  );

  const uniqueValues = useMemo(() => {
    const map: Record<number, string[]> = {};
    for (let col = 0; col < tableHeaders.length; col++) {
      const seen = new Set<string>();
      for (const row of tableRows) {
        const val = row[col]?.trim() ?? '';
        if (val && !seen.has(val)) seen.add(val);
      }
      map[col] = [...seen].sort();
    }
    return map;
  }, [tableHeaders.length, tableRows]);

  const processedRows = useMemo(() => {
    let result = tableRows.filter((row) =>
      Object.entries(filters).every(([colIdx, filterVal]) => {
        if (!filterVal) return true;
        return (row[Number(colIdx)]?.trim() ?? '') === filterVal;
      }),
    );

    result = result.filter((row) =>
      Object.entries(searchTerms).every(([colIdx, term]) => {
        if (!term) return true;
        return (row[Number(colIdx)]?.trim() ?? '')
          .toLowerCase()
          .includes(term.toLowerCase());
      }),
    );

    if (sortCol !== null && sortDir) {
      result = [...result].sort((a, b) => {
        const valA = a[sortCol]?.trim() ?? '';
        const valB = b[sortCol]?.trim() ?? '';
        const numA = parseFloat(valA.replace(/[^\d,.-]/g, '').replace(',', '.'));
        const numB = parseFloat(valB.replace(/[^\d,.-]/g, '').replace(',', '.'));
        const isNumeric = !isNaN(numA) && !isNaN(numB);
        const cmp = isNumeric ? numA - numB : valA.localeCompare(valB, 'it');
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [tableRows, filters, searchTerms, sortCol, sortDir]);

  const toggleSort = useCallback((colIdx: number, dir: SortDir) => {
    if (dir === null) {
      setSortCol(null);
      setSortDir(null);
    } else {
      setSortCol(colIdx);
      setSortDir(dir);
    }
  }, []);

  const toggleFilter = useCallback((colIdx: number) => {
    setOpenFilter((prev) => (prev === colIdx ? null : colIdx));
  }, []);

  const setColumnFilter = useCallback((colIdx: number, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value === '') {
        delete next[colIdx];
      } else {
        next[colIdx] = value;
      }
      return next;
    });
  }, []);

  const setColumnSearch = useCallback((colIdx: number, value: string) => {
    setSearchTerms((prev) => {
      const next = { ...prev };
      if (value === '') {
        delete next[colIdx];
      } else {
        next[colIdx] = value;
      }
      return next;
    });
  }, []);

  const activeCount = Object.keys(filters).length + Object.keys(searchTerms).length;

  function clearAll() {
    setFilters({});
    setSearchTerms({});
    setSortCol(null);
    setSortDir(null);
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border">
      {activeCount > 0 && (
        <div className="flex items-center gap-2 border-b bg-blue-50 px-3 py-1.5 text-[11px] text-blue-700">
          <Filter className="h-3 w-3" />
          {activeCount} {activeCount === 1 ? 'filtro attivo' : 'filtri attivi'}
          <button
            type="button"
            className="ml-auto underline hover:no-underline"
            onClick={clearAll}
          >
            Rimuovi tutti
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b bg-muted/50">
              {tableHeaders.map((header, idx) => (
                <th key={idx} className="relative whitespace-nowrap px-3 py-2 font-semibold">
                  <button
                    type="button"
                    className={cn(
                      'inline-flex items-center gap-1 transition-colors hover:text-primary',
                      filters[idx] || searchTerms[idx] ? 'text-blue-600' : '',
                    )}
                    onClick={() => toggleFilter(idx)}
                  >
                    {header}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {openFilter === idx && (
                    <ColumnDropdown
                      ref={dropdownRef}
                      colIdx={idx}
                      values={uniqueValues[idx] ?? []}
                      activeFilter={filters[idx] ?? ''}
                      searchTerm={searchTerms[idx] ?? ''}
                      currentSortDir={sortCol === idx ? sortDir : null}
                      onFilter={setColumnFilter}
                      onSearch={setColumnSearch}
                      onSort={(dir) => toggleSort(idx, dir)}
                      onClear={() => {
                        setColumnFilter(idx, '');
                        setColumnSearch(idx, '');
                        if (sortCol === idx) {
                          setSortCol(null);
                          setSortDir(null);
                        }
                        setOpenFilter(null);
                      }}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {processedRows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="border-b last:border-b-0 transition-colors hover:bg-muted/30"
              >
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx} className="whitespace-nowrap px-3 py-2">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {processedRows.length === 0 && (
              <tr>
                <td
                  colSpan={tableHeaders.length}
                  className="px-3 py-4 text-center text-muted-foreground"
                >
                  Nessun risultato per i filtri selezionati
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Column dropdown ---

import { forwardRef } from 'react';

interface ColumnDropdownProps {
  readonly colIdx: number;
  readonly values: readonly string[];
  readonly activeFilter: string;
  readonly searchTerm: string;
  readonly currentSortDir: SortDir;
  readonly onFilter: (colIdx: number, value: string) => void;
  readonly onSearch: (colIdx: number, value: string) => void;
  readonly onSort: (dir: SortDir) => void;
  readonly onClear: () => void;
}

const ColumnDropdown = forwardRef<HTMLDivElement, ColumnDropdownProps>(
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

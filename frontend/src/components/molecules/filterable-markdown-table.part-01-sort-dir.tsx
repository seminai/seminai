import {
  sanitizeUserFacingColumnLabel,
  sanitizeUserFacingValue,
} from '@/lib/safe-display';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ChevronDown, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColumnDropdown } from './filterable-markdown-table.part-02-column-dropdown';

export type SortDir = 'asc' | 'desc' | null;

export interface FilterableMarkdownTableProps {
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

export interface ColumnDropdownProps {
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

import { useState, useCallback, useEffect } from 'react';
import type { ColumnFiltersState, SortingState } from '@tanstack/react-table';

interface PersistedFilterState {
  readonly columnFilters: ColumnFiltersState;
  readonly sorting: SortingState;
}

const STORAGE_PREFIX = 'seminai-filters';

function storageKey(workspaceId: string): string {
  return `${STORAGE_PREFIX}:${workspaceId}`;
}

function loadFromStorage(workspaceId: string): PersistedFilterState {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId));
    if (!raw) return { columnFilters: [], sorting: [] };
    const parsed = JSON.parse(raw) as PersistedFilterState;
    return {
      columnFilters: Array.isArray(parsed.columnFilters) ? parsed.columnFilters : [],
      sorting: Array.isArray(parsed.sorting) ? parsed.sorting : [],
    };
  } catch {
    return { columnFilters: [], sorting: [] };
  }
}

function saveToStorage(workspaceId: string, state: PersistedFilterState): void {
  try {
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(state));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function usePersistedFilters(workspaceId: string) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    () => loadFromStorage(workspaceId).columnFilters,
  );
  const [sorting, setSorting] = useState<SortingState>(
    () => loadFromStorage(workspaceId).sorting,
  );

  // Re-load when workspace changes
  useEffect(() => {
    const saved = loadFromStorage(workspaceId);
    setColumnFilters(saved.columnFilters);
    setSorting(saved.sorting);
  }, [workspaceId]);

  // Persist on change
  useEffect(() => {
    saveToStorage(workspaceId, { columnFilters, sorting });
  }, [workspaceId, columnFilters, sorting]);

  const clearFilters = useCallback(() => {
    setColumnFilters([]);
    setSorting([]);
    localStorage.removeItem(storageKey(workspaceId));
  }, [workspaceId]);

  return {
    columnFilters,
    setColumnFilters,
    sorting,
    setSorting,
    clearFilters,
  } as const;
}

import { useMemo } from 'react';
import { useGetFieldNotes } from '@/generated/api/field-notes/field-notes';
import { extractArray } from '@/lib/api-response';
import type { FieldNoteResponse } from '@/types/field-note';

export function useFieldNotes() {
  const query = useGetFieldNotes();
  const fieldNotes = useMemo<readonly FieldNoteResponse[]>(() => {
    if (!query.data?.data) return [];
    return extractArray(query.data.data, 'fieldNotes') as unknown as FieldNoteResponse[];
  }, [query.data]);
  return { fieldNotes, isLoading: query.isLoading, isError: query.isError, error: query.error, refetch: query.refetch };
}

export function useFieldNotesByCompany(companyId: string | null) {
  const { fieldNotes, ...rest } = useFieldNotes();
  const filtered = useMemo(
    () =>
      companyId === null
        ? fieldNotes.filter((fn) => fn.company === null)
        : fieldNotes.filter((fn) => fn.company?.id === companyId),
    [fieldNotes, companyId],
  );
  return { fieldNotes: filtered, ...rest };
}

interface FieldNoteCompanyEntry {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  readonly latestUpdate: string;
}

export function useFieldNoteCompanies() {
  const { fieldNotes, isLoading } = useFieldNotes();
  const companies = useMemo<readonly FieldNoteCompanyEntry[]>(() => {
    const map = new Map<string, FieldNoteCompanyEntry>();
    for (const fn of fieldNotes) {
      const key = fn.company?.id ?? 'no-company';
      const name = fn.company?.name ?? 'Senza azienda';
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { id: key, name, count: 1, latestUpdate: fn.updatedAt });
      } else {
        map.set(key, {
          ...existing,
          count: existing.count + 1,
          latestUpdate: fn.updatedAt > existing.latestUpdate ? fn.updatedAt : existing.latestUpdate,
        });
      }
    }
    return [...map.values()];
  }, [fieldNotes]);
  return { companies, isLoading };
}

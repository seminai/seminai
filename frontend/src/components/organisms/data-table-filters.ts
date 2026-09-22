import type { DateRangeFilterValue } from '@/components/molecules/date-range-filter';

export function multiValueFilter(
  row: { getValue: (id: string) => unknown },
  columnId: string,
  filterValue: string[],
): boolean {
  if (!filterValue || filterValue.length === 0) return true;
  return filterValue.includes(String(row.getValue(columnId)));
}

export function dateRangeFilter<TData>(
  row: { readonly original: TData; getValue: (id: string) => unknown },
  columnId: string,
  filterValue: DateRangeFilterValue | undefined,
): boolean {
  if (!filterValue || (!filterValue.from && !filterValue.to)) return true;
  const original = row.original as Record<string, unknown> | null | undefined;
  const originalValue = original?.[`${columnId}Iso`];
  const iso =
    typeof originalValue === 'string' && originalValue.length > 0
      ? originalValue
      : String(row.getValue(columnId) ?? '');
  if (!iso) return false;
  if (filterValue.from && iso < filterValue.from) return false;
  return !filterValue.to || iso <= `${filterValue.to}T23:59:59.999Z`;
}

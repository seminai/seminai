import { lazy, Suspense, type ComponentProps } from 'react';
import { DataTable } from './data-table';
import { useTablesViewMode } from '@/hooks/use-tables-view-mode';

type DataTableProps<TData> = ComponentProps<typeof DataTable<TData>>;

/**
 * Lazy-loaded AG Grid Excel view. Keeps the main bundle lean for users that
 * never opt in to the Excel mode.
 */
const ExcelDataTable = lazy(() =>
  import('./excel-data-table').then((mod) => ({ default: mod.ExcelDataTable })),
) as unknown as typeof import('./excel-data-table').ExcelDataTable;

/**
 * Wrapper that renders either the classic `DataTable` or the Excel-like
 * `ExcelDataTable` depending on the user's `tablesViewMode` preference.
 *
 * Shares the exact same props as `DataTable`, so call-sites only need to
 * swap the import.
 */
export function DataTableSwitch<TData>(props: DataTableProps<TData>) {
  const { mode } = useTablesViewMode();

  if (mode === 'excel') {
    return (
      <Suspense fallback={<DataTable<TData> {...props} />}>
        <ExcelDataTable<TData> {...props} />
      </Suspense>
    );
  }

  return <DataTable<TData> {...props} />;
}

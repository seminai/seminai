import { lazy, Suspense, type ComponentProps } from 'react';
import { ExtractionDataTable } from './extraction-data-table';
import { useTablesViewMode } from '@/hooks/use-tables-view-mode';

type ExtractionDataTableProps = ComponentProps<typeof ExtractionDataTable>;

const ExtractionDataTableExcel = lazy(() =>
  import('./extraction-data-table-excel').then((mod) => ({
    default: mod.ExtractionDataTableExcel,
  })),
);

/**
 * Selects between the classic invoice edit table and its AG Grid-based variant
 * (Excel-like clipboard paste, range selection, single-click editing) based on
 * the user's `tablesViewMode` preference.
 *
 * Shares the exact same props as `ExtractionDataTable`, so call-sites only need
 * to swap the import.
 */
export function ExtractionDataTableSwitch(props: ExtractionDataTableProps) {
  const { mode } = useTablesViewMode();

  if (mode === 'excel') {
    return (
      <Suspense fallback={<ExtractionDataTable {...props} />}>
        <ExtractionDataTableExcel {...props} />
      </Suspense>
    );
  }

  return <ExtractionDataTable {...props} />;
}

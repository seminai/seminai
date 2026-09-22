import { lazy, Suspense, type ComponentProps } from 'react';
import { EditableExtractionTable } from './editable-extraction-table';
import { useTablesViewMode } from '@/hooks/use-tables-view-mode';

type EditableExtractionTableProps = ComponentProps<typeof EditableExtractionTable>;

const EditableExtractionTableExcel = lazy(() =>
  import('./editable-extraction-table-excel').then((mod) => ({
    default: mod.EditableExtractionTableExcel,
  })),
);

/**
 * Wrapper that selects between the classic editable extraction table and its
 * AG Grid-based variant (with Excel-like clipboard paste, range selection and
 * single-click editing) based on the user's `tablesViewMode` preference.
 */
export function EditableExtractionTableSwitch(props: EditableExtractionTableProps) {
  const { mode } = useTablesViewMode();

  if (mode === 'excel') {
    return (
      <Suspense fallback={<EditableExtractionTable {...props} />}>
        <EditableExtractionTableExcel {...props} />
      </Suspense>
    );
  }

  return <EditableExtractionTable {...props} />;
}

import { useMemo, useState } from 'react';
import {
  EditableExtractionColumnMenu,
  type EditableExtractionColumn,
} from '@/components/molecules/editable-extraction-column-menu';

export interface EditableExtractionTableProps {
  readonly title: string;
  readonly headers: readonly string[];
  readonly columns?: readonly EditableExtractionColumn[];
  readonly rows: readonly string[][];
  readonly editable?: boolean;
  readonly onRowsChange?: (rows: string[][]) => void;
}

export function EditableExtractionTable({
  title,
  headers,
  columns,
  rows,
  editable = false,
  onRowsChange,
}: EditableExtractionTableProps) {
  const resolvedColumns = useMemo<readonly EditableExtractionColumn[]>(
    () => columns ?? headers.map((label, index) => ({ id: `c${index}`, label })),
    [columns, headers],
  );
  const defaultVisibleColumnIds = useMemo(
    () => resolvedColumns.filter((column) => column.defaultVisible !== false).map((column) => column.id),
    [resolvedColumns],
  );
  const [visibleColumnIds, setVisibleColumnIds] = useState<readonly string[]>(defaultVisibleColumnIds);
  const visibleColumns = useMemo(() => {
    const visibleIds = new Set(visibleColumnIds);
    return resolvedColumns.filter((column) => visibleIds.has(column.id));
  }, [resolvedColumns, visibleColumnIds]);

  function updateCell(rowIndex: number, cellIndex: number, value: string): void {
    if (!editable || !onRowsChange) return;
    const nextRows = rows.map((row) => [...row]);
    if (!nextRows[rowIndex]) return;
    nextRows[rowIndex][cellIndex] = value;
    onRowsChange(nextRows);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        {columns ? (
          <EditableExtractionColumnMenu
            columns={resolvedColumns}
            visibleColumnIds={visibleColumnIds}
            onVisibleColumnIdsChange={setVisibleColumnIds}
          />
        ) : null}
      </div>
      <div className="overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              {visibleColumns.map((column) => (
                <th key={column.id} className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t">
                {visibleColumns.map((column) => {
                  const cellIndex = resolvedColumns.findIndex((candidate) => candidate.id === column.id);
                  const cell = row[cellIndex] ?? '';
                  const canEditCell = editable && column.readOnly !== true;
                  return (
                  <td key={column.id} className="px-3 py-1.5">
                    {canEditCell ? (
                      <input
                        value={cell}
                        onChange={(event) => updateCell(rowIndex, cellIndex, event.target.value)}
                        className="w-full min-w-16 border-0 bg-transparent p-0 text-sm outline-none"
                      />
                    ) : (
                      cell || '-'
                    )}
                  </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

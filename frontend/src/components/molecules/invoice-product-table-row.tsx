import { TruncatedText } from '@/components/atoms/truncated-text';
import { InvoiceProductCategorySelect } from '@/components/molecules/invoice-product-category-select';
import { Input } from '@/components/ui/input';
import type { InvoiceColumn } from '@/lib/ag-grid/invoice-columns';
import { formatProductCategoryLabel } from '@/lib/invoice-cell-values';
import { cn } from '@/lib/utils';
import type { ExtractionCategoryOption } from '@/lib/extraction-product-category';
import type { ConfirmableStockEntry } from '@/types/extraction';

export interface InvoiceProductGridColumn extends InvoiceColumn {
  readonly width: string;
}

export interface InvoiceEditingCell {
  readonly rowIndex: number;
  readonly colIndex: number;
}

interface InvoiceProductTableRowProps {
  readonly row: ConfirmableStockEntry;
  readonly rowIndex: number;
  readonly columns: readonly InvoiceProductGridColumn[];
  readonly gridCols: string;
  readonly isEditable: boolean;
  readonly isSaving: boolean;
  readonly editing: InvoiceEditingCell | null;
  readonly isManufacturing: boolean;
  readonly categoryOptions: readonly ExtractionCategoryOption[];
  readonly isRowSelected: (rowIndex: number) => boolean;
  readonly isCellSelected: (rowIndex: number, colIndex: number) => boolean;
  readonly onRowHeaderClick: (rowIndex: number, shiftKey: boolean) => void;
  readonly onCellClick: (rowIndex: number, colIndex: number, shiftKey: boolean) => void;
  readonly onCellChange: (rowIndex: number, colIndex: number, value: string) => void;
  readonly onCellBlur: () => void;
  readonly onCancelEditing: () => void;
}

export function InvoiceProductTableRow({
  row,
  rowIndex,
  columns,
  gridCols,
  isEditable,
  isSaving,
  editing,
  isManufacturing,
  categoryOptions,
  isRowSelected,
  isCellSelected,
  onRowHeaderClick,
  onCellClick,
  onCellChange,
  onCellBlur,
  onCancelEditing,
}: InvoiceProductTableRowProps) {
  return (
    <div
      className={cn(
        'grid h-10 max-h-10 text-sm transition-colors',
        rowIndex % 2 === 0 ? 'bg-background' : 'bg-muted/30',
      )}
      style={{ gridTemplateColumns: gridCols }}
    >
      <div
        className={cn(
          'flex items-center justify-center border-r border-b border-border text-xs text-muted-foreground select-none',
          isEditable && 'cursor-pointer',
          isRowSelected(rowIndex) && 'bg-primary/15 text-primary font-semibold',
        )}
        onClick={(event) => {
          if (!isEditable || isSaving) return;
          event.stopPropagation();
          onRowHeaderClick(rowIndex, event.shiftKey);
        }}
      >
        {rowIndex + 1}
      </div>

      {columns.map((col, colIndex) => {
        const isEditing =
          editing?.rowIndex === rowIndex && editing.colIndex === colIndex;
        const cellSelected = isCellSelected(rowIndex, colIndex);
        const rawValue = (row as unknown as Record<string, unknown>)[col.key];
        const value = rawValue == null ? '' : String(rawValue);

        return (
          <div
            key={col.key}
            className={cn(
              'h-10 min-w-0 overflow-hidden border-b border-r border-border last:border-r-0',
              isEditable && 'cursor-cell',
              !isEditing && 'select-none',
              cellSelected && !isEditing && 'bg-primary/10',
              isEditing && 'ring-2 ring-inset ring-primary/40',
            )}
            onMouseDown={(event) => {
              if (!isEditable || isSaving || isEditing) return;
              event.preventDefault();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onCellClick(rowIndex, colIndex, event.shiftKey);
            }}
          >
            {isEditing ? (
              col.key === 'productCategory' ? (
                <InvoiceProductCategorySelect
                  value={value}
                  options={categoryOptions}
                  disabled={!isEditable || isSaving}
                  allowCustomInput={isManufacturing}
                  className="h-full rounded-none border-0 px-2 text-sm shadow-none focus-visible:ring-0"
                  onChange={(nextValue) => onCellChange(rowIndex, colIndex, nextValue)}
                />
              ) : (
                <Input
                  value={value}
                  onChange={(event) => onCellChange(rowIndex, colIndex, event.target.value)}
                  onBlur={onCellBlur}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onCellBlur();
                    if (event.key === 'Escape') onCancelEditing();
                  }}
                  className="h-full w-full rounded-none border-0 px-3 py-1.5 text-sm shadow-none focus-visible:ring-0"
                  autoFocus
                  disabled={!isEditable || isSaving}
                />
              )
            ) : (
              <div className="min-w-0 px-3 py-1.5">
                <TruncatedText
                  text={
                    col.key === 'productCategory'
                      ? formatProductCategoryLabel(value, categoryOptions)
                      : value
                  }
                  maxWidth="100%"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

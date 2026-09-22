import { cn } from '@/lib/utils';
import type { InvoiceProductGridColumn } from '@/components/molecules/invoice-product-table-row';

interface InvoiceProductTableHeaderProps {
  readonly columns: readonly InvoiceProductGridColumn[];
  readonly gridCols: string;
  readonly isEditable: boolean;
  readonly isSaving: boolean;
  readonly isColumnSelected: (colIndex: number) => boolean;
  readonly onColumnClick: (colIndex: number, shiftKey: boolean) => void;
}

export function InvoiceProductTableHeader({
  columns,
  gridCols,
  isEditable,
  isSaving,
  isColumnSelected,
  onColumnClick,
}: InvoiceProductTableHeaderProps) {
  return (
    <div
      className="sticky top-0 z-10 grid bg-muted/70 text-xs font-semibold text-muted-foreground"
      style={{ gridTemplateColumns: gridCols }}
    >
      <div className="border-b border-r border-border px-2 py-2 text-center select-none">
        #
      </div>
      {columns.map((col, colIndex) => (
        <div
          key={col.key}
          className={cn(
            'border-b border-r border-border px-3 py-2 last:border-r-0 select-none',
            isEditable && 'cursor-pointer',
            isColumnSelected(colIndex) && 'bg-primary/15 text-primary',
          )}
          onClick={(event) => {
            if (!isEditable || isSaving) return;
            event.stopPropagation();
            onColumnClick(colIndex, event.shiftKey);
          }}
        >
          {col.label}
        </div>
      ))}
    </div>
  );
}

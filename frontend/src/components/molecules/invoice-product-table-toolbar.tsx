import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';

interface InvoiceProductTableToolbarProps {
  readonly isEditable: boolean;
  readonly isSaving: boolean;
  readonly hasChanges: boolean;
  readonly headerActions?: ReactNode;
  readonly onAddRow: () => void;
  readonly onRestore: () => void;
  readonly onSave: () => void;
}

export function InvoiceProductTableToolbar({
  isEditable,
  isSaving,
  hasChanges,
  headerActions,
  onAddRow,
  onRestore,
  onSave,
}: InvoiceProductTableToolbarProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <h4 className="shrink-0 text-sm font-semibold">Prodotti</h4>
      {isEditable ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          {headerActions}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={onAddRow}
            disabled={isSaving}
            aria-label="Aggiungi riga"
            title="Aggiungi riga"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRestore}
            disabled={!hasChanges || isSaving}
          >
            Ripristina
          </Button>
          <Button size="sm" onClick={onSave} disabled={!hasChanges || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvataggio...
              </>
            ) : (
              'Salva'
            )}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Modifica non disponibile per questo stato
        </p>
      )}
    </div>
  );
}

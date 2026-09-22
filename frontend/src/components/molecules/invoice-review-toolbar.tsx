import { MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface WarehouseOption {
  readonly id: string;
  readonly name: string;
}

interface InvoiceReviewToolbarProps {
  readonly warehouseId: string;
  readonly warehouseOptions: readonly WarehouseOption[];
  readonly onWarehouseChange: (next: string) => void;
  readonly canConfirm: boolean;
  readonly isEditable: boolean;
  readonly isSaving: boolean;
  readonly isConfirming: boolean;
  readonly hasReviewChanges: boolean;
  readonly selectedReviewCount: number;
  readonly onSaveReview: () => void;
  readonly onConfirmImport: () => void;
  readonly onReturnToEdit: () => void;
  readonly onDeleteSelected: () => void;
}

export function InvoiceReviewToolbar({
  warehouseId,
  warehouseOptions,
  onWarehouseChange,
  canConfirm,
  isEditable,
  isSaving,
  isConfirming,
  hasReviewChanges,
  selectedReviewCount,
  onSaveReview,
  onConfirmImport,
  onReturnToEdit,
  onDeleteSelected,
}: InvoiceReviewToolbarProps) {
  const saveDisabled = isSaving || !hasReviewChanges;
  const saveTitle = saveDisabled && !isSaving ? 'Nessuna modifica da salvare' : undefined;

  if (!canConfirm && !isEditable) return null;

  return (
    <div className="sticky top-0 z-20 -mx-3 flex flex-wrap items-center gap-2 border-y bg-background/95 px-3 py-2 backdrop-blur">
      <select
        value={warehouseId}
        onChange={(event) => onWarehouseChange(event.target.value)}
        className="h-8 min-w-[180px] flex-1 rounded-md border border-input bg-background px-2 text-sm"
        aria-label="Magazzino destinazione"
      >
        <option value="">Default (primo magazzino)</option>
        {warehouseOptions.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {canConfirm ? (
          <>
            {isEditable && (
              <Button
                variant="outline"
                size="sm"
                disabled={saveDisabled}
                title={saveTitle}
                onClick={onSaveReview}
              >
                {isSaving ? 'Salvataggio...' : 'Salva revisione'}
              </Button>
            )}
            <Button disabled={isConfirming} onClick={onConfirmImport}>
              {isConfirming ? 'Confermando...' : 'Conferma importazione'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={isConfirming || isSaving}
                    aria-label="Azioni revisione"
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem disabled={isConfirming} onClick={onReturnToEdit}>
                  Torna alla modifica
                </DropdownMenuItem>
                {isEditable && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={isConfirming || selectedReviewCount === 0}
                      onClick={onDeleteSelected}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Elimina selezionate ({selectedReviewCount})
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={isConfirming}
              onClick={onReturnToEdit}
            >
              Torna alla modifica
            </Button>
            <Button
              variant="outline"
              disabled={saveDisabled}
              title={saveTitle}
              onClick={onSaveReview}
            >
              {isSaving ? 'Salvataggio...' : 'Salva revisione'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

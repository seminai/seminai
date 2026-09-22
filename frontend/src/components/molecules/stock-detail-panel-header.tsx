import { Button } from '@/components/ui/button';
import { Loader2, PanelRightClose, Pencil, RefreshCw, Save, X } from 'lucide-react';

interface StockDetailPanelHeaderProps {
  readonly name: string;
  readonly category: string;
  readonly isEditingProduct: boolean;
  readonly isSavingProduct: boolean;
  readonly canReextractLabel: boolean;
  readonly isSyncingLabel: boolean;
  readonly onEdit: () => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
  readonly onReextractLabel: () => void;
  readonly onClose?: () => void;
}

export function StockDetailPanelHeader({
  name,
  category,
  isEditingProduct,
  isSavingProduct,
  canReextractLabel,
  isSyncingLabel,
  onEdit,
  onCancel,
  onSave,
  onReextractLabel,
  onClose,
}: StockDetailPanelHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold">{name}</h2>
        <span className="text-xs text-muted-foreground">{category}</span>
      </div>
      <div className="flex gap-1">
        {isEditingProduct ? (
          <>
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSavingProduct}>
              <X className="mr-1 h-3.5 w-3.5" />
              Annulla
            </Button>
            <Button size="sm" onClick={onSave} disabled={isSavingProduct}>
              {isSavingProduct ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1 h-3.5 w-3.5" />
              )}
              Salva
            </Button>
          </>
        ) : (
          <>
            {canReextractLabel ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onReextractLabel}
                disabled={isSyncingLabel}
                title="Re-estrai etichetta"
              >
                {isSyncingLabel ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                )}
                Re-estrai etichetta
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Modifica
            </Button>
          </>
        )}
        {onClose ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onClose}
            title="Chiudi sidebar"
            aria-label="Chiudi sidebar"
            className="shrink-0"
          >
            <PanelRightClose />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

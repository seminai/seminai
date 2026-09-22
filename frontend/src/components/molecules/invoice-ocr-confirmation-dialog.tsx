import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type {
  InvoiceCellOperation,
  InvoiceCellOperationPlan,
} from '@/lib/invoice-cell-operations';

interface InvoiceOcrConfirmationDialogProps {
  readonly open: boolean;
  readonly operationLabel: string;
  readonly operation: InvoiceCellOperation | null;
  readonly plan: InvoiceCellOperationPlan | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
}

export function InvoiceOcrConfirmationDialog({
  open,
  operationLabel,
  operation,
  plan,
  onOpenChange,
  onConfirm,
}: InvoiceOcrConfirmationDialogProps) {
  const conflictCount = plan?.conflicts.length ?? 0;
  const nonEmptyCount = plan?.nonEmptyCellCount ?? 0;
  const cellCount = plan?.summary.cellCount ?? 0;
  const rowCount = plan?.summary.rowCount ?? 0;
  const isClear = operation === 'clear';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conferma correzione OCR</DialogTitle>
          <DialogDescription>
            {operationLabel} modifichera {cellCount} celle in {rowCount} righe.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          {isClear ? (
            <p>
              Verranno svuotate {nonEmptyCount} celle gia valorizzate nella
              selezione.
            </p>
          ) : (
            <p>
              Verranno sovrascritte {conflictCount} celle di destinazione gia
              valorizzate.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button type="button" onClick={onConfirm}>
            Applica
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useCallback, useMemo, useState } from 'react';
import { Copy, Eraser, MoveDown, MoveUp } from 'lucide-react';
import { toast } from 'sonner';
import type { BulkAction } from '@/components/molecules/selection-action-bar';
import { InvoiceOcrConfirmationDialog } from '@/components/molecules/invoice-ocr-confirmation-dialog';
import {
  INVOICE_CELL_OPERATION_LABELS,
  INVOICE_CELL_OPERATIONS,
  getInvoiceCellOperationBlockReason,
  getInvoiceCellSelectionSummary,
  planInvoiceCellOperation,
  type InvoiceCellCoord,
  type InvoiceCellOperation,
  type InvoiceCellOperationPlan,
} from '@/lib/invoice-cell-operations';
import type { ConfirmableStockEntry } from '@/types/extraction';

interface UseInvoiceOcrCellActionsOptions {
  readonly rows: readonly ConfirmableStockEntry[];
  readonly selectedCells: readonly InvoiceCellCoord[];
  readonly enabled: boolean;
  readonly applyRows: (rows: readonly ConfirmableStockEntry[]) => void;
  readonly getExtraBlockReason?: () => string | null;
}

interface PendingConfirmation {
  readonly operation: InvoiceCellOperation;
  readonly plan: InvoiceCellOperationPlan;
}

const SHORTCUTS: Record<InvoiceCellOperation, string> = {
  'move-up': 'Alt+ArrowUp',
  'move-down': 'Alt+ArrowDown',
  clear: '',
  'copy-above': 'Alt+Shift+ArrowUp',
  'copy-below': 'Alt+Shift+ArrowDown',
};

export function useInvoiceOcrCellActions({
  rows,
  selectedCells,
  enabled,
  applyRows,
  getExtraBlockReason,
}: UseInvoiceOcrCellActionsOptions) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const summary = useMemo(
    () => getInvoiceCellSelectionSummary(selectedCells),
    [selectedCells],
  );

  const getDisabledReason = useCallback(
    (operation: InvoiceCellOperation): string | null => {
      if (!enabled) return 'Modifica non disponibile.';
      return (
        getExtraBlockReason?.() ??
        getInvoiceCellOperationBlockReason(rows, selectedCells, operation)
      );
    },
    [enabled, getExtraBlockReason, rows, selectedCells],
  );

  const applyPlan = useCallback(
    (plan: InvoiceCellOperationPlan) => {
      if (plan.status !== 'ready') return;
      applyRows(plan.rows);
    },
    [applyRows],
  );

  const runAction = useCallback(
    (operation: InvoiceCellOperation) => {
      const disabledReason = getDisabledReason(operation);
      if (disabledReason) {
        toast.error(disabledReason);
        return;
      }

      const plan = planInvoiceCellOperation({ rows, selectedCells, operation });
      if (plan.status === 'blocked') {
        toast.error(plan.blockedReason ?? 'Operazione non disponibile.');
        return;
      }
      if (plan.requiresConfirmation) {
        setPending({ operation, plan });
        return;
      }
      applyPlan(plan);
    },
    [applyPlan, getDisabledReason, rows, selectedCells],
  );

  const actions = useMemo<readonly BulkAction[]>(
    () =>
      INVOICE_CELL_OPERATIONS.map((operation) => {
        const disabledReason = getDisabledReason(operation);
        const shortcut = SHORTCUTS[operation];
        return {
          label: INVOICE_CELL_OPERATION_LABELS[operation],
          icon: getOperationIcon(operation),
          onClick: () => runAction(operation),
          disabled: Boolean(disabledReason),
          title: disabledReason ?? shortcut,
          variant: operation === 'clear' ? 'outline' : 'ghost',
        };
      }),
    [getDisabledReason, runAction],
  );

  const confirmationDialog = (
    <InvoiceOcrConfirmationDialog
      open={pending != null}
      operation={pending?.operation ?? null}
      operationLabel={
        pending ? INVOICE_CELL_OPERATION_LABELS[pending.operation] : 'Correzione OCR'
      }
      plan={pending?.plan ?? null}
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
      onConfirm={() => {
        if (pending) applyPlan(pending.plan);
        setPending(null);
      }}
    />
  );

  return {
    actions,
    confirmationDialog,
    runAction,
    selectedCellCount: summary.cellCount,
    selectedLabel: `${summary.cellCount} celle in ${summary.rowCount} righe`,
  };
}

function getOperationIcon(operation: InvoiceCellOperation): React.ReactNode {
  if (operation === 'move-up') return <MoveUp className="h-4 w-4" />;
  if (operation === 'move-down') return <MoveDown className="h-4 w-4" />;
  if (operation === 'clear') return <Eraser className="h-4 w-4" />;
  return <Copy className="h-4 w-4" />;
}

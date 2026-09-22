import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExtractionDataTableSwitch } from '@/components/molecules/extraction-data-table-switch';
import { InvoiceReviewTable } from '@/components/molecules/invoice-review-table';
import { InvoiceReviewToolbar } from '@/components/molecules/invoice-review-toolbar';
import { InvoiceSharedFields } from '@/components/molecules/invoice-shared-fields';
import {
  extractSharedFields,
  applySharedFieldChange,
} from '@/lib/invoice-shared-fields-utils';
import {
  areReviewEntriesEqual,
  cloneReviewEntries,
  sanitizeRegistrationNumber,
} from '@/lib/invoice-review-diff';
import { normalizeConfirmEntry } from '@/lib/normalize-confirm-entry';
import type {
  ConfirmExtractionPayload,
  ConfirmableStockEntry,
  DdtEntry,
  DdtExtractionData,
  ExtractionData,
  InvoiceEntry,
  InvoiceExtractionData,
  ResolvedCategory,
} from '@/types/extraction';

interface WarehouseOption {
  readonly id: string;
  readonly name: string;
}

export type InvoiceStep = 'edit' | 'review';

export interface InvoiceExtractionSectionHandle {
  readonly openReview: () => void;
  readonly confirmImport: () => Promise<void>;
}

interface InvoiceExtractionSectionProps {
  readonly category: ResolvedCategory;
  readonly companyId: string;
  readonly invoiceEntries: readonly ConfirmableStockEntry[];
  readonly warehouseOptions: readonly WarehouseOption[];
  readonly isEditable: boolean;
  readonly isSaving: boolean;
  readonly isConfirming: boolean;
  readonly canConfirm: boolean;
  readonly invoiceStep: InvoiceStep;
  readonly onInvoiceStepChange: (next: InvoiceStep) => void;
  readonly onSaveExtractedData: (nextData: ExtractionData) => Promise<void>;
  readonly onConfirm: (payload?: ConfirmExtractionPayload) => Promise<void>;
}

export const InvoiceExtractionSection = forwardRef<
  InvoiceExtractionSectionHandle,
  InvoiceExtractionSectionProps
>(function InvoiceExtractionSection(
  {
    category,
    companyId,
    invoiceEntries,
    warehouseOptions,
    isEditable,
    isSaving,
    isConfirming,
    canConfirm,
    invoiceStep,
    onInvoiceStepChange,
    onSaveExtractedData,
    onConfirm,
  },
  ref,
) {
  const [reviewRows, setReviewRows] = useState<readonly ConfirmableStockEntry[]>([]);
  const [reviewBaseline, setReviewBaseline] = useState<readonly ConfirmableStockEntry[] | null>(
    null,
  );
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const sharedFields = useMemo(
    () => extractSharedFields(invoiceEntries, category),
    [category, invoiceEntries],
  );

  const initialReviewRows = useMemo(() => {
    return invoiceEntries.map((entry) => ({
      ...entry,
      accepted: entry.accepted !== false,
      registrationNumber: sanitizeRegistrationNumber(entry.registrationNumber),
    }));
  }, [invoiceEntries]);

  const visibleReviewRows =
    invoiceStep === 'review' && reviewRows.length === 0 ? initialReviewRows : reviewRows;

  const openReview = useCallback(() => {
    const snapshot = cloneReviewEntries(initialReviewRows);
    setReviewRows(snapshot);
    setReviewBaseline(snapshot);
    onInvoiceStepChange('review');
    setConfirmError(null);
  }, [initialReviewRows, onInvoiceStepChange]);

  const hasReviewChanges = useMemo(() => {
    if (invoiceStep !== 'review' || reviewBaseline === null) return false;
    return !areReviewEntriesEqual(visibleReviewRows, reviewBaseline);
  }, [invoiceStep, reviewBaseline, visibleReviewRows]);

  const selectedReviewCount = useMemo(
    () => visibleReviewRows.filter((entry) => entry.accepted !== false).length,
    [visibleReviewRows],
  );

  const buildReviewPayload = useCallback((): InvoiceExtractionData | DdtExtractionData => {
    const entries = visibleReviewRows.map((entry) => ({
      ...entry,
      registrationNumber: sanitizeRegistrationNumber(entry.registrationNumber),
    }));
    return category === 'ddt'
      ? { entries: entries as readonly DdtEntry[], extractedCount: entries.length }
      : { entries: entries as readonly InvoiceEntry[], extractedCount: entries.length };
  }, [category, visibleReviewRows]);

  const handleSharedFieldChange = useCallback(
    (key: string, value: string) => {
      const updatedEntries = applySharedFieldChange(invoiceEntries, category, key, value);
      const updated: ExtractionData =
        category === 'ddt'
          ? { entries: updatedEntries as readonly DdtEntry[], extractedCount: updatedEntries.length }
          : { entries: updatedEntries as readonly InvoiceEntry[], extractedCount: updatedEntries.length };
      void onSaveExtractedData(updated);
    },
    [category, invoiceEntries, onSaveExtractedData],
  );

  const closeReviewAndReturnToEdit = useCallback(() => {
    onInvoiceStepChange('edit');
    setReviewBaseline(null);
    setConfirmError(null);
  }, [onInvoiceStepChange]);

  const saveReview = useCallback(async () => {
    const payload = buildReviewPayload();
    await onSaveExtractedData(payload);
    const savedEntries = cloneReviewEntries(payload.entries);
    setReviewRows(savedEntries);
    setReviewBaseline(savedEntries);
  }, [buildReviewPayload, onSaveExtractedData]);

  const deleteSelectedReviewRows = useCallback(() => {
    setReviewRows(visibleReviewRows.filter((entry) => entry.accepted === false));
    setConfirmError(null);
  }, [visibleReviewRows]);

  const confirmImport = useCallback(async () => {
    const acceptedRows = visibleReviewRows.filter((row) => row.accepted !== false);
    if (acceptedRows.length === 0) {
      setConfirmError('Nessun prodotto selezionato per la conferma.');
      return;
    }
    setConfirmError(null);
    try {
      await onConfirm({
        warehouseId: selectedWarehouseId || undefined,
        invoiceEntries: acceptedRows.map((entry) =>
          normalizeConfirmEntry(
            {
              ...entry,
              registrationNumber: sanitizeRegistrationNumber(entry.registrationNumber),
            },
            category,
          ),
        ),
      });
    } catch {
      // Server-side validation errors are surfaced via the confirm toast.
    }
  }, [category, onConfirm, selectedWarehouseId, visibleReviewRows]);

  useImperativeHandle(
    ref,
    () => ({ openReview, confirmImport }),
    [openReview, confirmImport],
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Fase: <span className="font-medium">{invoiceStep === 'edit' ? 'Modifica' : 'Revisione'}</span>
        </p>
      </div>
      <InvoiceSharedFields
        category={category}
        values={sharedFields}
        editable={invoiceStep === 'edit' && isEditable}
        onChange={handleSharedFieldChange}
      />
      {invoiceStep === 'edit' ? (
        <ExtractionDataTableSwitch
          category={category}
          companyId={companyId}
          data={invoiceEntries}
          isEditable={isEditable}
          isSaving={isSaving}
          headerActions={
            isEditable ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={isConfirming}
                className="text-blue-600 hover:text-blue-700"
                onClick={openReview}
              >
                <Eye className="mr-1 h-4 w-4" />
                Apri revisione
              </Button>
            ) : null
          }
          onSave={async (rows) => {
            const nextData: ExtractionData =
              category === 'ddt'
                ? { entries: rows as readonly DdtEntry[], extractedCount: rows.length }
                : { entries: rows as readonly InvoiceEntry[], extractedCount: rows.length };
            await onSaveExtractedData(nextData);
          }}
        />
      ) : (
        <div className="min-w-0 space-y-3 rounded-md border p-3">
          <InvoiceReviewToolbar
            warehouseId={selectedWarehouseId}
            warehouseOptions={warehouseOptions}
            onWarehouseChange={setSelectedWarehouseId}
            canConfirm={canConfirm}
            isEditable={isEditable}
            isSaving={isSaving}
            isConfirming={isConfirming}
            hasReviewChanges={hasReviewChanges}
            selectedReviewCount={selectedReviewCount}
            onSaveReview={() => void saveReview()}
            onConfirmImport={() => void confirmImport()}
            onReturnToEdit={closeReviewAndReturnToEdit}
            onDeleteSelected={deleteSelectedReviewRows}
          />
          {confirmError && <p className="text-sm text-red-600">{confirmError}</p>}
          <InvoiceReviewTable
            category={category}
            rows={visibleReviewRows}
            companyId={companyId}
            disabled={!isEditable || isConfirming}
            onChange={(nextRows) => {
              setReviewRows(nextRows);
              setConfirmError(null);
            }}
          />
        </div>
      )}
    </div>
  );
});

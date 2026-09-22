import { useMemo, useState, type Ref } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AgriculturalExtractionSection,
  type AgriculturalExtractionSectionHandle,
  type AgriculturalStep,
} from '@/components/organisms/agricultural-extraction-section';
import {
  InvoiceExtractionSection,
  type InvoiceExtractionSectionHandle,
  type InvoiceStep,
} from '@/components/organisms/invoice-extraction-section';
import {
  cloneExtractionData,
  applyFieldRows,
  applyProductionUnitRows,
  applyStockRows,
} from '@/components/molecules/editable-extraction-table.helpers';
import { EditableExtractionTableSwitch } from '@/components/molecules/editable-extraction-table-switch';
import { useGetWarehousesCompanyCompanyId } from '@/generated/api/warehouses/warehouses';
import { extractArray } from '@/lib/api-response';
import {
  fieldExtractionColumns,
  productionUnitExtractionColumns,
  stockExtractionColumns,
  toFieldExtractionRows,
  toProductionUnitExtractionRows,
  toStockExtractionRows,
} from '@/lib/extraction-review-columns';
import type {
  ConfirmExtractionPayload,
  ExtractionData,
  FileExtractionResponse,
  InvoiceEntry,
  DdtEntry,
  StockExtractionData,
  StockPreviewEntry,
} from '@/types/extraction';

interface ExtractionSummaryPanelProps {
  readonly extraction: FileExtractionResponse;
  readonly isEditable: boolean;
  readonly isSaving: boolean;
  readonly isConfirming: boolean;
  readonly canConfirm: boolean;
  readonly invoiceStep: InvoiceStep;
  readonly onInvoiceStepChange: (next: InvoiceStep) => void;
  readonly invoiceSectionRef?: Ref<InvoiceExtractionSectionHandle>;
  readonly agriculturalSectionRef?: Ref<AgriculturalExtractionSectionHandle>;
  readonly agriculturalStep?: AgriculturalStep;
  readonly onAgriculturalStepChange?: (nextStep: AgriculturalStep) => void;
  readonly onSaveExtractedData: (nextData: ExtractionData) => Promise<void>;
  readonly onConfirm: (payload?: ConfirmExtractionPayload) => Promise<void>;
}

export function ExtractionSummaryPanel({
  extraction,
  isEditable,
  isSaving,
  isConfirming,
  canConfirm,
  invoiceStep,
  onInvoiceStepChange,
  invoiceSectionRef,
  agriculturalSectionRef,
  agriculturalStep = 'fields',
  onAgriculturalStepChange,
  onSaveExtractedData,
  onConfirm,
}: ExtractionSummaryPanelProps) {
  const data = extraction.extractedData;
  const isAgricultural = extraction.category === 'agricultural';
  const { data: warehousesResponse } = useGetWarehousesCompanyCompanyId(extraction.companyId);
  const [draftData, setDraftData] = useState<ExtractionData | null>(() =>
    data ? cloneExtractionData(data) : null,
  );
  const [isCellEditingEnabled, setIsCellEditingEnabled] = useState(false);

  const warehouseOptions = useMemo(() => {
    return extractArray(warehousesResponse?.data, 'warehouses').map((warehouse) => ({
      id: String(warehouse.id ?? ''),
      name: String(warehouse.name ?? 'Magazzino'),
    }));
  }, [warehousesResponse]);

  const invoiceEntries = useMemo(() => {
    if (!data || !('entries' in data) || !data.entries.length) return null;
    if (!('productName' in data.entries[0])) return null;
    return data.entries as readonly InvoiceEntry[];
  }, [data]);

  const hasEditableTables =
    !isAgricultural &&
    draftData != null &&
    ((!invoiceEntries && 'entries' in draftData && draftData.entries.length > 0) ||
      ('fields' in draftData && draftData.fields.length > 0) ||
      ('productionUnits' in draftData && draftData.productionUnits.length > 0));

  const hasChanges = useMemo(() => {
    if (!data || !draftData) return false;
    return JSON.stringify(data) !== JSON.stringify(draftData);
  }, [data, draftData]);

  if (!draftData) {
    return <p className="text-sm text-muted-foreground">Nessun dato estratto</p>;
  }

  if (isAgricultural) {
    return (
      <AgriculturalExtractionSection
        ref={agriculturalSectionRef}
        extraction={extraction}
        step={agriculturalStep}
        onStepChange={onAgriculturalStepChange ?? (() => undefined)}
        isEditable={isEditable}
        isSaving={isSaving}
        isConfirming={isConfirming}
        onSaveExtractedData={onSaveExtractedData}
        onConfirm={onConfirm}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Categoria: <span className="font-medium text-foreground">{extraction.category}</span>
        {' — '}
        {draftData.extractedCount} elementi estratti
      </p>
      {hasEditableTables ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant={isCellEditingEnabled ? 'default' : 'outline'}
            size="sm"
            onClick={() => setIsCellEditingEnabled((prev) => !prev)}
            disabled={!isEditable}
          >
            <Pencil className="mr-2 h-4 w-4" />
            {isCellEditingEnabled ? 'Modifica attiva' : 'Abilita modifica'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDraftData(data ? cloneExtractionData(data) : null)}
            disabled={!isEditable || !hasChanges}
          >
            Ripristina
          </Button>
          <Button
            size="sm"
            onClick={async () => draftData && onSaveExtractedData(draftData)}
            disabled={!isEditable || !hasChanges || isSaving}
          >
            {isSaving ? 'Salvataggio...' : 'Salva modifiche'}
          </Button>
        </div>
      ) : null}
      {'fields' in draftData && draftData.fields && !('productionUnits' in draftData) && (
        <EditableExtractionTableSwitch
          title="Campi"
          headers={fieldExtractionColumns.map((column) => column.label)}
          columns={fieldExtractionColumns}
          rows={toFieldExtractionRows(draftData.fields)}
          editable={isEditable && isCellEditingEnabled}
          onRowsChange={(rows) => {
            setDraftData((previous) => {
              if (!previous || !('fields' in previous)) return previous;
              return { ...previous, fields: applyFieldRows(previous.fields, rows) };
            });
          }}
        />
      )}
      {'productionUnits' in draftData && draftData.productionUnits && (
        <EditableExtractionTableSwitch
          title="Unità Produttive"
          headers={productionUnitExtractionColumns.map((column) => column.label)}
          columns={productionUnitExtractionColumns}
          rows={toProductionUnitExtractionRows(draftData.productionUnits)}
          editable={isEditable && isCellEditingEnabled}
          onRowsChange={(rows) => {
            setDraftData((previous) => {
              if (!previous || !('productionUnits' in previous)) return previous;
              return {
                ...previous,
                productionUnits: applyProductionUnitRows(previous.productionUnits, rows),
              };
            });
          }}
        />
      )}
      {'entries' in draftData && draftData.entries && invoiceEntries && (
        <InvoiceExtractionSection
          ref={invoiceSectionRef}
          category={extraction.category}
          companyId={extraction.companyId}
          invoiceEntries={invoiceEntries}
          warehouseOptions={warehouseOptions}
          isEditable={isEditable}
          isSaving={isSaving}
          isConfirming={isConfirming}
          canConfirm={canConfirm}
          invoiceStep={invoiceStep}
          onInvoiceStepChange={onInvoiceStepChange}
          onSaveExtractedData={onSaveExtractedData}
          onConfirm={onConfirm}
        />
      )}
      {'entries' in draftData && draftData.entries && !invoiceEntries && (
        <EditableExtractionTableSwitch
          title="Prodotti"
          headers={stockExtractionColumns.map((column) => column.label)}
          columns={stockExtractionColumns}
          rows={toStockExtractionRows((draftData as StockExtractionData).entries)}
          editable={isEditable && isCellEditingEnabled}
          onRowsChange={(rows) => {
            setDraftData((previous) => {
              if (!previous || !isStockExtractionData(previous)) return previous;
              return { ...previous, entries: applyStockRows(previous.entries, rows) };
            });
          }}
        />
      )}
    </div>
  );
}

function isStockExtractionData(data: ExtractionData): data is StockExtractionData {
  if (!('entries' in data)) return false;
  if (data.entries.length === 0) return true;
  return isStockPreviewEntry(data.entries[0]);
}

function isStockPreviewEntry(
  entry: InvoiceEntry | DdtEntry | StockPreviewEntry,
): entry is StockPreviewEntry {
  return 'stock' in entry;
}

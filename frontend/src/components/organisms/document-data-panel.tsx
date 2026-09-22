import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExtractionInfoList } from '@/components/molecules/extraction-info-list';
import { ExtractionSummaryPanel } from '@/components/organisms/extraction-summary-panel';
import type { AgriculturalExtractionSectionHandle } from '@/components/organisms/agricultural-extraction-section';
import type {
  InvoiceExtractionSectionHandle,
  InvoiceStep,
} from '@/components/organisms/invoice-extraction-section';
import { useConfirmExtraction, useUpdateExtraction } from '@/hooks/use-extractions';
import type {
  ConfirmExtractionPayload,
  FileExtractionResponse,
  ExtractionData,
  InvoiceExtractionData,
} from '@/types/extraction';
import { useTabs, type TabData } from '@/hooks/use-tabs';

interface DocumentDataPanelProps {
  readonly extraction: FileExtractionResponse;
}

export function DocumentDataPanel({ extraction }: DocumentDataPanelProps) {
  const confirmMutation = useConfirmExtraction();
  const updateMutation = useUpdateExtraction();
  const { addTabs } = useTabs();
  const isPending = extraction.status === 'PENDING_CONFIRMATION';
  const isAgricultural = extraction.category === 'agricultural';
  const hasInvoiceRows = isInvoiceExtractionData(extraction.extractedData);
  const canEditExtractedData =
    extraction.status === 'PENDING_CONFIRMATION' || extraction.status === 'CONFIRMED';

  const [invoiceStep, setInvoiceStep] = useState<InvoiceStep>('edit');
  const [agriculturalStep, setAgriculturalStep] = useState<'fields' | 'production_units'>('fields');
  const invoiceSectionRef = useRef<InvoiceExtractionSectionHandle>(null);
  const agriculturalSectionRef = useRef<AgriculturalExtractionSectionHandle>(null);

  useEffect(() => {
    setAgriculturalStep('fields');
  }, [extraction.id]);

  async function handleConfirm(payload?: ConfirmExtractionPayload) {
    try {
      await confirmMutation.mutateAsync({ id: extraction.id, payload });
      setInvoiceStep('edit');
      setAgriculturalStep('fields');
      openManagementTabs(extraction, addTabs);
    } catch {
      // Error already surfaced via useConfirmExtraction onError toast.
    }
  }

  async function handleSaveExtractedData(nextData: ExtractionData) {
    await updateMutation.mutateAsync({
      id: extraction.id,
      extractedData: nextData,
    });
  }

  function handleProceedToReview() {
    invoiceSectionRef.current?.openReview();
  }

  async function handleConfirmInvoiceImport() {
    await invoiceSectionRef.current?.confirmImport();
  }

  async function handleAgriculturalNext() {
    await agriculturalSectionRef.current?.goNext();
  }

  function handleAgriculturalBack() {
    agriculturalSectionRef.current?.goBack();
  }

  async function handleConfirmAgricultural() {
    await agriculturalSectionRef.current?.confirm();
  }

  const showGenericConfirm = isPending && !hasInvoiceRows && !isAgricultural;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs defaultValue="dati" className="min-h-0 flex-1">
        <div className="border-b px-4 pt-2">
          <TabsList>
            <TabsTrigger value="dati">Dati estratti</TabsTrigger>
            <TabsTrigger value="informazioni">Informazioni</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent
          value="dati"
          className={
            isAgricultural
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden p-4'
              : 'min-h-0 flex-1 overflow-auto p-4'
          }
        >
          <ExtractionSummaryPanel
            key={extraction.id}
            extraction={extraction}
            isEditable={canEditExtractedData}
            isSaving={updateMutation.isPending}
            isConfirming={confirmMutation.isPending}
            canConfirm={isPending}
            invoiceStep={invoiceStep}
            onInvoiceStepChange={setInvoiceStep}
            invoiceSectionRef={invoiceSectionRef}
            agriculturalSectionRef={agriculturalSectionRef}
            agriculturalStep={agriculturalStep}
            onAgriculturalStepChange={setAgriculturalStep}
            onSaveExtractedData={handleSaveExtractedData}
            onConfirm={handleConfirm}
          />
        </TabsContent>
        <TabsContent value="informazioni" className="min-h-0 flex-1 overflow-auto p-4">
          <ExtractionInfoList extraction={extraction} />
        </TabsContent>
      </Tabs>
      <div className="flex items-center justify-end gap-3 border-t px-4 py-3">
        {isPending && (
          <Badge
            variant="outline"
            className="bg-yellow-50 font-medium text-yellow-700 border-yellow-300"
          >
            Da Confermare
          </Badge>
        )}
        {extraction.status === 'CONFIRMED' && (
          <Badge variant="outline" className="bg-green-50 font-medium text-green-700 border-green-200">
            Confermato
          </Badge>
        )}
        {showGenericConfirm && (
          <Button onClick={() => handleConfirm()} disabled={confirmMutation.isPending}>
            {confirmMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Confermando...
              </>
            ) : (
              'Conferma'
            )}
          </Button>
        )}
        {isPending && isAgricultural && agriculturalStep === 'fields' && (
          <Button onClick={() => void handleAgriculturalNext()} disabled={confirmMutation.isPending}>
            Avanti
          </Button>
        )}
        {isPending && isAgricultural && agriculturalStep === 'production_units' && (
          <>
            <Button
              variant="outline"
              onClick={handleAgriculturalBack}
              disabled={confirmMutation.isPending}
            >
              Indietro
            </Button>
            <Button onClick={() => void handleConfirmAgricultural()} disabled={confirmMutation.isPending}>
              {confirmMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confermando...
                </>
              ) : (
                'Conferma'
              )}
            </Button>
          </>
        )}
        {isPending && hasInvoiceRows && invoiceStep === 'edit' && (
          <Button onClick={handleProceedToReview} disabled={confirmMutation.isPending}>
            Procedi a revisione
          </Button>
        )}
        {isPending && hasInvoiceRows && invoiceStep === 'review' && (
          <Button onClick={handleConfirmInvoiceImport} disabled={confirmMutation.isPending}>
            {confirmMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Confermando...
              </>
            ) : (
              'Conferma importazione'
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function openManagementTabs(
  extraction: FileExtractionResponse,
  addTabs: (tabs: readonly TabData[]) => void,
): void {
  const base = {
    source: 'archivio' as const,
    subtitle: extraction.fileName,
    format: '-',
  };
  if (extraction.category === 'agricultural') {
    addTabs([
      { id: `fields-${extraction.companyId}`, title: 'Campi', ...base },
      { id: `pu-${extraction.companyId}`, title: 'Unità Produttive', ...base },
    ]);
    return;
  }
  if (extraction.category === 'fields') {
    addTabs([{ id: `fields-${extraction.companyId}`, title: 'Campi', ...base }]);
    return;
  }
  if (extraction.category === 'production_units') {
    addTabs([{ id: `pu-${extraction.companyId}`, title: 'Unità Produttive', ...base }]);
  }
}

function isInvoiceExtractionData(data: ExtractionData | null): data is InvoiceExtractionData {
  if (!data || !('entries' in data)) return false;
  if (data.entries.length === 0) return false;
  return 'productName' in data.entries[0];
}

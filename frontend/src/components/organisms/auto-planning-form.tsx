import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImportToolbar } from '@/components/molecules/import-toolbar';
import { ImportFilePanel } from '@/components/molecules/import-file-panel';
import { OcrProviderSelector } from '@/components/molecules/ocr-provider-selector';
import { AutoConfigPanel } from '@/components/molecules/auto-config-panel';
import { ProductSpreadsheet } from '@/components/organisms/product-spreadsheet';
import { useDosageAgentStartJob } from '@/hooks/use-dosage-agent-job';
import { useAutoPlanningImports } from '@/hooks/use-auto-planning-imports';
import { useTabs } from '@/hooks/use-tabs';
import type { usePlanningState } from '@/hooks/use-planning-state';
import type { PlanningProduct, StartDosageJobRequest } from '@/types/planning';

interface AutoPlanningFormProps {
  readonly planning: ReturnType<typeof usePlanningState>;
}

export function AutoPlanningForm({ planning }: AutoPlanningFormProps) {
  const { state } = planning;
  const navigate = useNavigate();
  const { removeTab } = useTabs();
  const startJob = useDosageAgentStartJob();
  const [selectedIndices, setSelectedIndices] = useState<ReadonlySet<number>>(new Set());
  const imports = useAutoPlanningImports({ planning });

  function addEmptyProduct() {
    const product: PlanningProduct = {
      productName: '',
      registrationNumber: '',
      quantity: 0,
      quantityUnitOfMeasure: 'L',
    };
    planning.addAutoProducts([product]);
  }

  function toggleSelection(index: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIndices.size === state.autoProducts.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(state.autoProducts.map((_, i) => i)));
    }
  }

  function removeSelected() {
    const remaining = state.autoProducts.filter((_, i) => !selectedIndices.has(i));
    planning.setAutoProducts(remaining);
    setSelectedIndices(new Set());
  }

  async function handleSubmit() {
    if (state.autoProducts.length === 0) return;
    if (!state.companyId) return;

    const request: StartDosageJobRequest = {
      products: state.autoProducts,
      unitOfProduction: state.productionUnitIds.map((id) => ({ id })),
      strategy: state.autoConfig.strategy,
      startAt: state.autoConfig.startAt || undefined,
      endAt: state.autoConfig.endAt || undefined,
      outStockLimiter: state.autoConfig.outStockLimiter,
      orchestrator: state.autoConfig.orchestrator,
      operationMachines:
        state.autoConfig.machines.length > 0 ? state.autoConfig.machines : undefined,
      operationOperators:
        state.autoConfig.operators.length > 0 ? state.autoConfig.operators : undefined,
    };

    const result = await startJob.mutateAsync(request);
    removeTab('add-data');
    void navigate({
      to: '/',
      search: {},
      state: { pendingJobId: result.data.jobId } as Record<string, unknown>,
    });
  }

  const canSubmit =
    state.autoProducts.length > 0 &&
    state.productionUnitIds.length > 0 &&
    !startJob.isPending;

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <ImportToolbar
        companyId={state.companyId ?? ''}
        companyName={state.companyName ?? ''}
        activePanel={imports.activePanel}
        onImport={planning.addAutoProducts}
        onTogglePanel={imports.setActivePanel}
      />

      {imports.activePanel && (
        <ImportFilePanel
          mode={imports.activePanel}
          isPending={imports.isPanelPending}
          progress={imports.importProgress}
          extraContent={
            imports.activePanel === 'ddt' ? (
              <OcrProviderSelector
                value={imports.ocrProvider}
                onValueChange={imports.setOcrProvider}
                disabled={imports.isPanelPending}
              />
            ) : null
          }
          onSubmit={imports.handlePanelSubmit}
          onClose={() => imports.setActivePanel(null)}
        />
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Prodotti ({state.autoProducts.length})
          </h3>
          <div className="flex items-center gap-2">
            {selectedIndices.size > 0 && (
              <Button variant="outline" size="sm" onClick={removeSelected}>
                <Trash2 className="mr-1.5 h-4 w-4 text-destructive" />
                Elimina ({selectedIndices.size})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={addEmptyProduct}>
              <Plus className="mr-1.5 h-4 w-4" />
              Aggiungi riga
            </Button>
          </div>
        </div>

        {state.autoProducts.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Nessun prodotto. Importa dal magazzino, CSV, DDT, brogliaccio oppure aggiungi manualmente.
          </p>
        ) : (
          <ProductSpreadsheet
            products={state.autoProducts}
            selectedIndices={selectedIndices}
            onProductChange={(index, product) => {
              const updated = state.autoProducts.map((p, i) => (i === index ? product : p));
              planning.setAutoProducts(updated);
            }}
            onToggleSelection={toggleSelection}
            onToggleAll={toggleAll}
            onClearSelection={() => setSelectedIndices(new Set())}
            onRemoveProduct={(index) => {
              planning.removeAutoProduct(index);
              setSelectedIndices((prev) => {
                const next = new Set<number>();
                for (const idx of prev) {
                  if (idx < index) next.add(idx);
                  else if (idx > index) next.add(idx - 1);
                }
                return next;
              });
            }}
          />
        )}
      </div>

      <AutoConfigPanel
        companyId={state.companyId ?? ''}
        config={state.autoConfig}
        onChange={planning.setAutoConfig}
      />

      <div className="flex justify-end border-t pt-4">
        <Button disabled={!canSubmit} onClick={() => void handleSubmit()}>
          {startJob.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Avvio calcolo...
            </>
          ) : (
            'Calcola dosaggi'
          )}
        </Button>
      </div>
    </div>
  );
}

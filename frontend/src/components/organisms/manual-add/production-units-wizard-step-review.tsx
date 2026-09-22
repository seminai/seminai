import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentChatPanel } from '@/components/organisms/agent-chat-panel';
import { ProductionUnitsKanban } from '@/components/organisms/manual-add/production-units-kanban';
import { ResizablePanelLayout } from '@/components/molecules/resizable-panel-layout';
import type { ProductionUnitDraft } from '@/components/organisms/manual-add/production-units-wizard-types';
import { totalAllocatedHa } from '@/components/organisms/manual-add/production-units-wizard-types';
import { useFormPatchListener } from '@/hooks/use-form-patch-listener';

interface ProductionUnitsWizardStepReviewProps {
  readonly units: readonly ProductionUnitDraft[];
  readonly companyId: string;
  readonly disabled?: boolean;
  readonly isSubmitting?: boolean;
  readonly embedded?: boolean;
  readonly onBack: () => void;
  readonly onEdit: (unitId: string) => void;
  readonly onDelete: (unitId: string) => void;
  readonly onAddAnother: () => void;
  readonly onUnitsChange: (units: ProductionUnitDraft[]) => void;
  readonly onSubmit: () => void;
}

export function ProductionUnitsWizardStepReview({
  units,
  companyId,
  disabled,
  isSubmitting,
  embedded,
  onBack,
  onEdit,
  onDelete,
  onAddAnother,
  onUnitsChange,
  onSubmit,
}: ProductionUnitsWizardStepReviewProps) {
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [chatThreadId] = useState(() => crypto.randomUUID());

  useFormPatchListener(chatThreadId, units, onUnitsChange);

  const clientContext = useMemo(
    () => ({
      formMode: 'production_units' as const,
      formSnapshot: { companyId, units },
    }),
    [companyId, units],
  );

  const reviewContent = (
    <div className="flex h-full flex-col gap-4 overflow-auto p-1">
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'list' | 'kanban')}>
        <TabsList>
          <TabsTrigger value="list">Lista</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="mt-4 space-y-3">
          {units.length === 0 ? (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">
              Nessuna unità produttiva in bozza. Aggiungine una.
            </p>
          ) : (
            units.map((unit, index) => (
              <UnitReviewCard
                key={unit.id}
                unit={unit}
                index={index}
                disabled={disabled}
                onEdit={() => onEdit(unit.id)}
                onDelete={() => onDelete(unit.id)}
              />
            ))
          )}
        </TabsContent>
        <TabsContent value="kanban" className="mt-4">
          <ProductionUnitsKanban
            units={units}
            companyId={companyId}
            disabled={disabled}
            onUnitsChange={onUnitsChange}
          />
        </TabsContent>
      </Tabs>

      {embedded ? (
        <Button type="button" variant="outline" disabled={disabled || isSubmitting} onClick={onAddAnother}>
          <Plus className="mr-1.5 h-4 w-4" />
          Aggiungi un&apos;altra unità
        </Button>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" disabled={disabled || isSubmitting} onClick={onAddAnother}>
            <Plus className="mr-1.5 h-4 w-4" />
            Aggiungi un&apos;altra unità
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={disabled || isSubmitting} onClick={onBack}>
              Indietro
            </Button>
            <Button
              type="button"
              disabled={disabled || isSubmitting || units.length === 0}
              onClick={onSubmit}
            >
              {isSubmitting
                ? 'Creazione...'
                : `Crea ${units.length} ${units.length === 1 ? 'unità' : 'unità'}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  const chatContent = (
    <AgentChatPanel
      localThreadId={chatThreadId}
      clientContext={clientContext}
      placeholder="Chiedi all'assistente di modificare le UP o di darti un consiglio agronomico..."
      emptyHint="Chiedi all'assistente di aggiungere, rimuovere o modificare unità produttive."
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ResizablePanelLayout
        left={reviewContent}
        right={chatContent}
        defaultSizes={[65, 35]}
        leftLabel="Revisione"
        rightLabel="Assistente"
      />
    </div>
  );
}

interface UnitReviewCardProps {
  readonly unit: ProductionUnitDraft;
  readonly index: number;
  readonly disabled?: boolean;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

function UnitReviewCard({ unit, index, disabled, onEdit, onDelete }: UnitReviewCardProps) {
  const totalHa = totalAllocatedHa(unit.allocations);
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">
            {unit.name || `Unità produttiva ${index + 1}`}
          </h3>
          <p className="text-xs text-muted-foreground">
            {unit.cropName} · {totalHa.toLocaleString('it-IT')} ha
          </p>
        </div>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {unit.allocations.map((allocation) => (
          <Badge key={`${unit.id}-${allocation.fieldId}`} variant="secondary">
            {(allocation.fieldName ?? allocation.fieldId)} · {allocation.areaHa.toLocaleString('it-IT')} ha
          </Badge>
        ))}
      </div>
    </div>
  );
}

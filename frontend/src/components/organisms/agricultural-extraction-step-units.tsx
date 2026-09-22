import { useMemo, useState } from 'react';
import { ProductionUnitsWizardStepDetail } from '@/components/organisms/manual-add/production-units-wizard-step-detail';
import { ProductionUnitsWizardStepReview } from '@/components/organisms/manual-add/production-units-wizard-step-review';
import {
  createEmptyDraft,
  getCurrentYearRange,
  type ProductionUnitDraft,
} from '@/components/organisms/manual-add/production-units-wizard-types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface AgriculturalExtractionStepUnitsProps {
  readonly units: readonly ProductionUnitDraft[];
  readonly companyId: string;
  readonly disabled?: boolean;
  readonly onUnitsChange: (units: ProductionUnitDraft[]) => void;
}

export function AgriculturalExtractionStepUnits({
  units,
  companyId,
  disabled,
  onUnitsChange,
}: AgriculturalExtractionStepUnitsProps) {
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const dateRange = useMemo(() => getCurrentYearRange(), []);

  const editingUnit = units.find((unit) => unit.id === editingUnitId) ?? null;
  const isCreating = editingUnitId === '__new__';

  function handleSaveUnit(draft: ProductionUnitDraft) {
    if (isCreating) {
      onUnitsChange([...units, draft]);
    } else {
      onUnitsChange(units.map((unit) => (unit.id === draft.id ? draft : unit)));
    }
    setEditingUnitId(null);
  }

  function handleDeleteUnit(unitId: string) {
    onUnitsChange(units.filter((unit) => unit.id !== unitId));
  }

  function handleAddUnit() {
    setEditingUnitId('__new__');
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ProductionUnitsWizardStepReview
          units={units}
          companyId={companyId}
          disabled={disabled}
          embedded
          onBack={() => undefined}
          onEdit={(unitId) => setEditingUnitId(unitId)}
          onDelete={handleDeleteUnit}
          onAddAnother={handleAddUnit}
          onUnitsChange={onUnitsChange}
          onSubmit={() => undefined}
        />
      </div>
      <Sheet open={editingUnitId != null} onOpenChange={(open) => !open && setEditingUnitId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {isCreating ? 'Nuova unità produttiva' : 'Modifica unità produttiva'}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <ProductionUnitsWizardStepDetail
              allocations={editingUnit?.allocations ?? []}
              dateRange={dateRange}
              initialDraft={isCreating ? createEmptyDraft() : editingUnit}
              disabled={disabled}
              onBack={() => setEditingUnitId(null)}
              onSave={handleSaveUnit}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

import { BackButton } from '@/components/molecules/back-button';
import { getAddDataBackTarget } from '@/lib/add-data-back-target';
import { PlanningCompanySelector } from '@/components/organisms/planning-company-selector';
import { ManualPlanningForm } from '@/components/organisms/manual-planning-form';
import { AutoPlanningForm } from '@/components/organisms/auto-planning-form';
import { usePlanningState } from '@/hooks/use-planning-state';

interface PlanningLayoutProps {
  readonly mode: 'manual' | 'auto';
}

export function PlanningLayout({ mode }: PlanningLayoutProps) {
  const planning = usePlanningState();
  const { state } = planning;

  return (
    <main className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <BackButton
            fallback={getAddDataBackTarget({ type: 'plan', mode })}
            onPress={state.step === 'configure' ? () => planning.prevStep() : undefined}
          />
          <div>
            <h2 className="text-lg font-semibold">
              {mode === 'manual' ? 'Pianificazione manuale' : 'Pianificazione automatica'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {state.step === 'company'
                ? 'Seleziona azienda e unita produttive'
                : mode === 'manual'
                  ? 'Compila le operazioni'
                  : 'Configura i dosaggi automatici'}
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {state.step === 'company' ? (
          <PlanningCompanySelector
            mode={mode}
            companyId={state.companyId}
            productionUnitIds={state.productionUnitIds}
            onCompanyChange={planning.setCompany}
            onProductionUnitsChange={planning.setProductionUnits}
            onProductionUnitOptionsChange={planning.setProductionUnitOptions}
            onNext={planning.nextStep}
          />
        ) : mode === 'manual' ? (
          <ManualPlanningForm planning={planning} />
        ) : (
          <AutoPlanningForm planning={planning} />
        )}
      </div>
    </main>
  );
}

import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { WizardStepper } from '@/components/atoms/wizard-stepper';
import { useCompanyOptions } from '@/hooks/use-company-options';
import { useExtractionToFormValues } from '@/hooks/use-extraction-to-form-values';
import { useApplyPrefillDrafts } from '@/hooks/use-apply-prefill-drafts';
import { useBulkCreateUnitsWithCleanup } from '@/hooks/use-bulk-create-units-with-cleanup';
import { useFieldAvailability } from '@/components/organisms/manual-add/use-field-availability';
import {
  getSearchValidationError,
  getSubmitValidationError,
} from '@/components/organisms/manual-add/production-units-wizard-validation';
import { ProductionUnitsPrefillBanner } from '@/components/organisms/manual-add/production-units-prefill-banner';
import { ProductionUnitsWizardStepAllocations } from '@/components/organisms/manual-add/production-units-wizard-step-allocations';
import { ProductionUnitsWizardStepContext } from '@/components/organisms/manual-add/production-units-wizard-step-context';
import { ProductionUnitsWizardStepDetail } from '@/components/organisms/manual-add/production-units-wizard-step-detail';
import { ProductionUnitsWizardStepReview } from '@/components/organisms/manual-add/production-units-wizard-step-review';
import {
  buildSessionUsedByFieldId,
  countUnitsWithInvalidAllocations,
  mergeFieldNames,
  validateSameCompanyFields,
} from '@/components/organisms/manual-add/production-units-wizard-allocation-utils';
import { draftToBulkItem } from '@/components/organisms/manual-add/production-units-wizard-schema';
import {
  WIZARD_STEPS,
  allocationsMapToRows,
  createEmptyDraft,
  draftAllocationsToMap,
  getCurrentYearRange,
  rowsToAllocations,
  type DateRange,
  type ProductionUnitDraft,
  type WizardStep,
} from '@/components/organisms/manual-add/production-units-wizard-types';

export type { ProductionUnitDraft };

interface ProductionUnitsBulkFormProps {
  readonly extractionIds?: readonly string[];
  readonly prefillCompanyId?: string;
}

export function ProductionUnitsBulkForm({
  extractionIds,
  prefillCompanyId,
}: ProductionUnitsBulkFormProps = {}) {
  const navigate = useNavigate();
  const { companies, isLoading: isLoadingCompanies } = useCompanyOptions();

  const hasPrefill = Boolean(extractionIds && extractionIds.length > 0);
  const [step, setStep] = useState<WizardStep>(hasPrefill ? 'review' : 'context');
  const [companyId, setCompanyId] = useState(prefillCompanyId ?? '');
  const [dateRange, setDateRange] = useState<DateRange>(() => getCurrentYearRange());
  const [hasSearched, setHasSearched] = useState(false);
  const [workingAllocations, setWorkingAllocations] = useState<Map<string, number>>(new Map());
  const [productionUnits, setProductionUnits] = useState<ProductionUnitDraft[]>([]);
  const [editingUnitId, setEditingUnitId] = useState<string | undefined>();
  const [detailDraft, setDetailDraft] = useState<ProductionUnitDraft | null>(null);
  const [hasAppliedPrefill, setHasAppliedPrefill] = useState(false);

  const prefillResult = useExtractionToFormValues(extractionIds, companyId);

  const handleApplyPrefill = useCallback((drafts: ProductionUnitDraft[]) => {
    setProductionUnits(drafts);
    setStep('review');
    setHasAppliedPrefill(true);
  }, []);

  useApplyPrefillDrafts({
    hasPrefill,
    hasApplied: hasAppliedPrefill,
    prefillResult,
    onApply: handleApplyPrefill,
  });

  function handleClearPrefill() {
    setHasAppliedPrefill(true);
    void navigate({ to: '/add-data', search: { type: 'manual', entity: 'production-units' } });
  }

  const stepIndex = WIZARD_STEPS.findIndex((entry) => entry.id === step);

  const { isFetching: isAvailabilityFetching, refetch: refetchAvailability, availableFields, availableByFieldId, excludedFields } =
    useFieldAvailability(companyId, dateRange, hasSearched);

  const sessionUsedByFieldId = useMemo(
    () => buildSessionUsedByFieldId(productionUnits, editingUnitId),
    [editingUnitId, productionUnits],
  );

  const mutation = useBulkCreateUnitsWithCleanup({ extractionIds });

  const isPending = mutation.isPending;

  const invalidAllocationsCount = useMemo(
    () => countUnitsWithInvalidAllocations(productionUnits),
    [productionUnits],
  );

  function handleSearch() {
    const error = getSearchValidationError(companyId, dateRange);
    if (error) {
      toast.error(error);
      return;
    }
    setHasSearched(true);
    refetchAvailability();
  }

  function startNewUnit() {
    setEditingUnitId(undefined);
    setDetailDraft(null);
    setWorkingAllocations(new Map());
    setStep('allocations');
  }

  function handleAssociate() {
    const rows = allocationsMapToRows(
      workingAllocations,
      new Map(availableFields.map((f) => [f.fieldId, f.fieldName])),
    );
    if (rows.length === 0) {
      toast.error('Alloca almeno un campo');
      return;
    }
    const fieldIds = rows.map((row) => row.fieldId);
    if (!validateSameCompanyFields(fieldIds, availableFields, companyId)) {
      toast.error('Tutti i campi devono appartenere alla stessa azienda');
      return;
    }
    const allocations = mergeFieldNames(rowsToAllocations(rows), availableByFieldId);
    const existing = editingUnitId
      ? productionUnits.find((unit) => unit.id === editingUnitId)
      : undefined;
    setDetailDraft(
      existing
        ? { ...existing, allocations }
        : { ...createEmptyDraft(), allocations, startDate: dateRange.start, endDate: dateRange.end },
    );
    setStep('detail');
  }

  function handleSaveDraft(draft: ProductionUnitDraft) {
    setProductionUnits((current) => {
      const index = current.findIndex((unit) => unit.id === draft.id);
      if (index >= 0) {
        return current.map((unit, i) => (i === index ? draft : unit));
      }
      return [...current, draft];
    });
    setEditingUnitId(undefined);
    setDetailDraft(null);
    setWorkingAllocations(new Map());
    setStep('review');
    toast.success('Unità salvata in bozza');
  }

  function handleEditUnit(unitId: string) {
    const unit = productionUnits.find((entry) => entry.id === unitId);
    if (!unit) return;
    setEditingUnitId(unitId);
    setDetailDraft(unit);
    setWorkingAllocations(draftAllocationsToMap(unit.allocations));
    setStep('allocations');
  }

  function handleDeleteUnit(unitId: string) {
    setProductionUnits((current) => current.filter((unit) => unit.id !== unitId));
  }

  function handleSubmitAll() {
    if (!companyId) {
      toast.error("Seleziona l'azienda");
      setStep('context');
      return;
    }
    const validUnits = productionUnits.filter((unit) => unit.allocations.length > 0);
    const error = getSubmitValidationError(validUnits);
    if (error) {
      toast.error(error.message, error.description ? { description: error.description } : undefined);
      return;
    }
    if (validUnits.length < productionUnits.length) {
      toast.warning('Alcune unità senza allocazioni sono state escluse');
    }
    mutation.mutate({
      data: {
        productionUnits: validUnits.map(draftToBulkItem),
      },
    });
  }

  const stepScrollable = step !== 'review';

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4">
      <div className="flex shrink-0 flex-col gap-4">
        {hasPrefill && (
          <ProductionUnitsPrefillBanner
            status={prefillResult.status}
            draftsCount={prefillResult.drafts.length}
            pending={prefillResult.pending}
            errors={prefillResult.errors}
            onClearPrefill={handleClearPrefill}
            emptyAllocationsCount={invalidAllocationsCount}
          />
        )}

        <WizardStepper
          steps={WIZARD_STEPS.map((entry) => entry.label)}
          currentIndex={stepIndex}
        />
      </div>

      <div
        className={
          stepScrollable
            ? 'min-h-0 flex-1 overflow-y-auto'
            : 'flex min-h-0 flex-1 flex-col overflow-hidden'
        }
      >
        {step === 'context' ? (
          <ProductionUnitsWizardStepContext
            companyId={companyId}
            companies={companies}
            isLoadingCompanies={isLoadingCompanies}
            dateRange={dateRange}
            hasSearched={hasSearched}
            disabled={isPending}
            onCompanyChange={(id) => {
              setCompanyId(id);
              setHasSearched(false);
            }}
            onDateRangeChange={setDateRange}
            onSearch={handleSearch}
            onNext={() => {
              if (!hasSearched) {
                toast.error('Esegui prima la ricerca campi');
                return;
              }
              startNewUnit();
            }}
            onCancel={() => void navigate({ to: '/add-data', search: { type: 'manual' } })}
          />
        ) : null}

        {step === 'allocations' ? (
          <ProductionUnitsWizardStepAllocations
            workingAllocations={workingAllocations}
            availableFields={availableFields}
            excludedFields={excludedFields}
            companyId={companyId}
            sessionUsedByFieldId={sessionUsedByFieldId}
            isLoading={isAvailabilityFetching}
            disabled={isPending}
            onWorkingChange={setWorkingAllocations}
            onBack={() => {
              if (detailDraft && editingUnitId) {
                setStep('review');
              } else {
                setStep('context');
              }
            }}
            onAssociate={handleAssociate}
          />
        ) : null}

        {step === 'detail' && detailDraft ? (
          <ProductionUnitsWizardStepDetail
            allocations={detailDraft.allocations}
            dateRange={dateRange}
            initialDraft={detailDraft}
            disabled={isPending}
            onBack={() => setStep('allocations')}
            onSave={handleSaveDraft}
          />
        ) : null}

        {step === 'review' ? (
          <ProductionUnitsWizardStepReview
            units={productionUnits}
            companyId={companyId}
            disabled={isPending}
            isSubmitting={isPending}
            onBack={() => setStep('context')}
            onEdit={handleEditUnit}
            onDelete={handleDeleteUnit}
            onAddAnother={startNewUnit}
            onUnitsChange={setProductionUnits}
            onSubmit={handleSubmitAll}
          />
        ) : null}
      </div>
    </div>
  );
}

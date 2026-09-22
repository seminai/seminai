import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { WizardStepper } from '@/components/atoms/wizard-stepper';
import { AgriculturalExtractionStepFields } from '@/components/organisms/agricultural-extraction-step-fields';
import { AgriculturalExtractionStepUnits } from '@/components/organisms/agricultural-extraction-step-units';
import { cloneExtractionData } from '@/components/molecules/editable-extraction-table.helpers';
import type { ProductionUnitDraft } from '@/components/organisms/manual-add/production-units-wizard-types';
import {
  mergeDraftsIntoAgriculturalData,
  normalizeAgriculturalData,
  previewsToDrafts,
} from '@/lib/agricultural-extraction-mappers';
import {
  validateAgriculturalFieldsStep,
  validateAgriculturalProductionUnitsStep,
} from '@/lib/agricultural-extraction-validation';
import type {
  AgriculturalExtractionData,
  ConfirmExtractionPayload,
  ExtractionData,
  FileExtractionResponse,
} from '@/types/extraction';

export type AgriculturalStep = 'fields' | 'production_units';

const AGRICULTURAL_STEPS = ['Campi', 'Unità produttive'] as const;

export interface AgriculturalExtractionSectionHandle {
  readonly goNext: () => Promise<boolean>;
  readonly goBack: () => void;
  readonly confirm: () => Promise<void>;
  readonly getStep: () => AgriculturalStep;
}

interface AgriculturalExtractionSectionProps {
  readonly extraction: FileExtractionResponse;
  readonly step: AgriculturalStep;
  readonly onStepChange: (nextStep: AgriculturalStep) => void;
  readonly isEditable: boolean;
  readonly isSaving: boolean;
  readonly isConfirming: boolean;
  readonly onSaveExtractedData: (nextData: ExtractionData) => Promise<void>;
  readonly onConfirm: (payload?: ConfirmExtractionPayload) => Promise<void>;
}

export const AgriculturalExtractionSection = forwardRef<
  AgriculturalExtractionSectionHandle,
  AgriculturalExtractionSectionProps
>(function AgriculturalExtractionSection(
  {
    extraction,
    step,
    onStepChange,
    isEditable,
    isSaving,
    isConfirming,
    onSaveExtractedData,
    onConfirm,
  },
  ref,
) {
  const serverData = extraction.extractedData as AgriculturalExtractionData | null;
  const [draftData, setDraftData] = useState<AgriculturalExtractionData | null>(() =>
    serverData ? normalizeAgriculturalData(cloneExtractionData(serverData) as AgriculturalExtractionData) : null,
  );
  const [unitDrafts, setUnitDrafts] = useState<ProductionUnitDraft[]>([]);
  const unitDraftsRef = useRef(unitDrafts);

  useEffect(() => {
    unitDraftsRef.current = unitDrafts;
  }, [unitDrafts]);

  useEffect(() => {
    if (!serverData) return;
    const normalized = normalizeAgriculturalData(
      cloneExtractionData(serverData) as AgriculturalExtractionData,
    );
    setDraftData(normalized);
    setUnitDrafts(previewsToDrafts(normalized.productionUnits, normalized.fields));
    onStepChange('fields');
  }, [extraction.id, onStepChange, serverData]);

  useEffect(() => {
    if (!serverData) return;
    const normalized = normalizeAgriculturalData(
      cloneExtractionData(serverData) as AgriculturalExtractionData,
    );
    setDraftData(normalized);
    setUnitDrafts(previewsToDrafts(normalized.productionUnits, normalized.fields));
  }, [extraction.updatedAt, serverData]);

  const buildPersistedData = useCallback(
    (fieldsDraft: AgriculturalExtractionData, drafts: readonly ProductionUnitDraft[]) =>
      mergeDraftsIntoAgriculturalData(fieldsDraft, drafts),
    [],
  );

  const hasChanges = useMemo(() => {
    if (!serverData || !draftData) return false;
    return JSON.stringify(serverData) !== JSON.stringify(buildPersistedData(draftData, unitDrafts));
  }, [serverData, draftData, unitDrafts, buildPersistedData]);

  const stepIndex = step === 'fields' ? 0 : 1;

  const persistDraft = useCallback(async () => {
    if (!draftData) return;
    const nextData = buildPersistedData(draftData, unitDraftsRef.current);
    await onSaveExtractedData(nextData);
    setDraftData(nextData);
    setUnitDrafts(previewsToDrafts(nextData.productionUnits, nextData.fields));
  }, [buildPersistedData, draftData, onSaveExtractedData]);

  const showValidationErrors = useCallback((messages: readonly string[]) => {
    messages.slice(0, 3).forEach((message) => toast.error(message));
    if (messages.length > 3) {
      toast.error(`Altri ${messages.length - 3} errori da correggere.`);
    }
  }, []);

  const goNext = useCallback(async (): Promise<boolean> => {
    if (!draftData) return false;
    const validation = validateAgriculturalFieldsStep(draftData);
    if (!validation.valid) {
      showValidationErrors(validation.errors.map((error) => error.message));
      return false;
    }
    try {
      if (hasChanges) {
        await persistDraft();
      }
      onStepChange('production_units');
      return true;
    } catch {
      return false;
    }
  }, [draftData, hasChanges, onStepChange, persistDraft, showValidationErrors]);

  const goBack = useCallback(() => {
    onStepChange('fields');
  }, [onStepChange]);

  const confirm = useCallback(async () => {
    if (!draftData || isConfirming) return;
    const merged = buildPersistedData(draftData, unitDraftsRef.current);
    const validation = validateAgriculturalProductionUnitsStep(merged);
    if (!validation.valid) {
      showValidationErrors(validation.errors.map((error) => error.message));
      return;
    }
    try {
      if (hasChanges || JSON.stringify(serverData) !== JSON.stringify(merged)) {
        await onSaveExtractedData(merged);
      }
      await onConfirm();
    } catch {
      // Errors surfaced by parent mutations.
    }
  }, [
    buildPersistedData,
    draftData,
    hasChanges,
    isConfirming,
    onConfirm,
    onSaveExtractedData,
    serverData,
    showValidationErrors,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      goNext,
      goBack,
      confirm,
      getStep: () => step,
    }),
    [confirm, goBack, goNext, step],
  );

  if (!draftData) {
    return <p className="text-sm text-muted-foreground">Nessun dato estratto</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Categoria: <span className="font-medium text-foreground">{extraction.category}</span>
        {' — '}
        {draftData.extractedCount} elementi estratti
      </p>
      <WizardStepper steps={[...AGRICULTURAL_STEPS]} currentIndex={stepIndex} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {step === 'fields' ? (
          <AgriculturalExtractionStepFields
            draftData={draftData}
            isEditable={isEditable}
            isSaving={isSaving}
            hasChanges={hasChanges}
            onDraftChange={setDraftData}
            onRestore={() => {
              if (!serverData) return;
              const restored = normalizeAgriculturalData(
                cloneExtractionData(serverData) as AgriculturalExtractionData,
              );
              setDraftData(restored);
              setUnitDrafts(previewsToDrafts(restored.productionUnits, restored.fields));
            }}
            onSave={persistDraft}
          />
        ) : (
          <AgriculturalExtractionStepUnits
            units={unitDrafts}
            companyId={extraction.companyId}
            disabled={!isEditable || isSaving || isConfirming}
            onUnitsChange={setUnitDrafts}
          />
        )}
      </div>
    </div>
  );
});

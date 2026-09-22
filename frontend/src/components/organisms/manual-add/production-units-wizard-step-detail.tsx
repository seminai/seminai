import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormFieldRow } from '@/components/atoms/form-field-row';
import { SearchableSelect } from '@/components/molecules/searchable-select';
import { SearchableSelectWithOther } from '@/components/molecules/searchable-select-with-other';
import { useCropCatalog } from '@/hooks/use-crop-catalog';
import { useCultivarOptions } from '@/hooks/use-cultivar-catalog';
import {
  PROTOCOL_OPTIONS,
  SOIL_USE_PRIMARY_OPTIONS,
  SOIL_USE_SECONDARY_OPTIONS,
  STRUCTURE_OPTIONS,
  toSelectOptions,
} from '@/components/organisms/manual-add/production-unit-form-options';
import { suggestCropDates } from '@/components/organisms/manual-add/production-units-wizard-crop-dates';
import {
  productionUnitDetailSchema,
  type ProductionUnitDetailInput,
  type ProductionUnitDetailValues,
} from '@/components/organisms/manual-add/production-units-wizard-schema';
import type {
  ProductionUnitsWizardStepDetailProps,
} from '@/components/organisms/manual-add/production-units-wizard-types';
import { totalAllocatedHa } from '@/components/organisms/manual-add/production-units-wizard-types';
import {
  buildProductionUnitDefaultValues,
  buildProductionUnitDraft,
} from './production-units-wizard-detail-mappers';
import { AllocationSummary, DetailActions } from './production-units-wizard-detail-chrome';

export function ProductionUnitsWizardStepDetail({
  allocations,
  dateRange,
  initialDraft,
  disabled,
  onBack,
  onSave,
}: ProductionUnitsWizardStepDetailProps) {
  const { options: cropOptions, byCode, isLoading: isLoadingCrops } = useCropCatalog();
  const totalHa = totalAllocatedHa(allocations);
  const [isHarvestManuallyEdited, setIsHarvestManuallyEdited] = useState(false);
  const [generatedDraftId] = useState(() => `pu-${crypto.randomUUID()}`);

  const form = useForm<ProductionUnitDetailInput, unknown, ProductionUnitDetailValues>({
    resolver: zodResolver(productionUnitDetailSchema),
    defaultValues: buildProductionUnitDefaultValues(initialDraft, dateRange),
  });

  const cropCode = useWatch({ control: form.control, name: 'cropCode' });
  const variety = useWatch({ control: form.control, name: 'variety' });
  const startDate = useWatch({ control: form.control, name: 'startDate' });
  const protocol = useWatch({ control: form.control, name: 'protocoll' });
  const protectionStructure = useWatch({
    control: form.control,
    name: 'protectionStructure',
  });
  const occupation = useWatch({ control: form.control, name: 'occupazione' });
  const destination = useWatch({ control: form.control, name: 'destinazioneDiUso' });
  const cropEntry = cropCode ? byCode.get(cropCode) : undefined;
  const {
    options: varietyOptions,
    catalog,
    isLoading: isLoadingVarieties,
  } = useCultivarOptions(cropCode);

  const suggestedHarvestDate = useMemo(() => {
    if (!catalog || !cropCode || !variety.trim()) return null;
    return catalog.getRecommendedHarvestDate({
      cropCode,
      variety,
      periodStart: startDate || dateRange.start,
    });
  }, [catalog, cropCode, dateRange.start, startDate, variety]);

  const applySuggestedHarvest = useCallback(
    (force = false) => {
      if (!force && isHarvestManuallyEdited) return;
      if (suggestedHarvestDate) {
        form.setValue('harvestingDate', suggestedHarvestDate);
        if (force) setIsHarvestManuallyEdited(false);
        return;
      }
      if (!cropEntry) return;
      const fallback = suggestCropDates(cropEntry, startDate || dateRange.start);
      if (fallback) {
        form.setValue('harvestingDate', fallback.harvestingDate);
        if (force) setIsHarvestManuallyEdited(false);
      }
    },
    [cropEntry, dateRange.start, form, isHarvestManuallyEdited, startDate, suggestedHarvestDate],
  );

  useEffect(() => {
    if (!cropEntry) return;
    form.setValue('cropName', cropEntry.species);
    form.setValue('cropType', cropEntry.cropType);
    const suggested = suggestCropDates(cropEntry, dateRange.start);
    if (suggested && !initialDraft?.floweringDate) {
      form.setValue('floweringDate', suggested.floweringDate);
    }
    if (!initialDraft?.harvestingDate && !isHarvestManuallyEdited) {
      applySuggestedHarvest();
    }
  }, [
    applySuggestedHarvest,
    cropEntry,
    dateRange.start,
    form,
    initialDraft?.floweringDate,
    initialDraft?.harvestingDate,
    isHarvestManuallyEdited,
  ]);

  useEffect(() => {
    if (!cropEntry || form.getValues('name').trim()) return;
    const fieldLabels = allocations
      .slice(0, 3)
      .map((a) => a.fieldName ?? 'Campo')
      .join(', ');
    const suffix = allocations.length > 3 ? ` e altri ${allocations.length - 3}` : '';
    form.setValue('name', `${cropEntry.species} - ${fieldLabels}${suffix}`);
  }, [allocations, cropEntry, form]);

  useEffect(() => {
    if (!variety.trim() || isHarvestManuallyEdited) return;
    applySuggestedHarvest();
  }, [applySuggestedHarvest, isHarvestManuallyEdited, variety]);

  const handleSubmit = form.handleSubmit((values) => {
    onSave(buildProductionUnitDraft({ values, initialDraft, generatedDraftId, allocations }));
  });

  const errors = form.formState.errors;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <AllocationSummary totalHa={totalHa} allocationCount={allocations.length} />

      <section className="rounded-lg border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormFieldRow id="pu-name" label="Nome *" error={errors.name?.message}>
            <Input id="pu-name" {...form.register('name')} disabled={disabled} />
          </FormFieldRow>
          <FormFieldRow id="pu-crop" label="Coltura *" error={errors.cropCode?.message}>
            <SearchableSelect
              value={cropCode}
              options={cropOptions}
              placeholder={isLoadingCrops ? 'Caricamento...' : 'Seleziona coltura'}
              searchPlaceholder="Cerca coltura..."
              emptyMessage="Nessuna coltura trovata."
              disabled={disabled || isLoadingCrops}
              onChange={(next) => {
                form.setValue('cropCode', next ?? '', { shouldValidate: true });
                form.setValue('variety', '');
                setIsHarvestManuallyEdited(false);
              }}
            />
          </FormFieldRow>
          <FormFieldRow id="pu-variety" label="Varietà *" error={errors.variety?.message}>
            <SearchableSelectWithOther
              value={variety}
              options={varietyOptions}
              placeholder={isLoadingVarieties ? 'Caricamento...' : 'Seleziona varietà'}
              searchPlaceholder="Cerca varietà..."
              otherPlaceholder="Inserisci varietà"
              disabled={disabled || !cropCode}
              onChange={(value) => {
                form.setValue('variety', value, { shouldValidate: true });
                setIsHarvestManuallyEdited(false);
              }}
            />
          </FormFieldRow>
          <FormFieldRow id="pu-protocol" label="Protocollo *" error={errors.protocoll?.message}>
            <SearchableSelectWithOther
              value={protocol}
              options={toSelectOptions(PROTOCOL_OPTIONS)}
              placeholder="Seleziona protocollo"
              searchPlaceholder="Cerca protocollo..."
              otherPlaceholder="Es. Natura 2000"
              disabled={disabled}
              onChange={(value) => form.setValue('protocoll', value, { shouldValidate: true })}
            />
          </FormFieldRow>
          <FormFieldRow
            id="pu-structure"
            label="Struttura *"
            error={errors.protectionStructure?.message}
          >
            <SearchableSelectWithOther
              value={protectionStructure}
              options={toSelectOptions(STRUCTURE_OPTIONS)}
              placeholder="Seleziona struttura"
              searchPlaceholder="Cerca struttura..."
              otherPlaceholder="Es. serra tunnel"
              disabled={disabled}
              onChange={(value) =>
                form.setValue('protectionStructure', value, { shouldValidate: true })
              }
            />
          </FormFieldRow>
          <FormFieldRow id="pu-occ" label="Uso suolo primario" error={errors.occupazione?.message}>
            <SearchableSelectWithOther
              value={occupation}
              options={toSelectOptions(SOIL_USE_PRIMARY_OPTIONS)}
              placeholder="Seleziona uso primario"
              searchPlaceholder="Cerca..."
              otherPlaceholder="Uso suolo primario"
              disabled={disabled}
              onChange={(value) => form.setValue('occupazione', value)}
            />
          </FormFieldRow>
          <FormFieldRow
            id="pu-dest"
            label="Uso suolo secondario"
            error={errors.destinazioneDiUso?.message}
          >
            <SearchableSelectWithOther
              value={destination}
              options={toSelectOptions(SOIL_USE_SECONDARY_OPTIONS)}
              placeholder="Seleziona uso secondario"
              searchPlaceholder="Cerca..."
              otherPlaceholder="Uso suolo secondario"
              disabled={disabled}
              onChange={(value) => form.setValue('destinazioneDiUso', value)}
            />
          </FormFieldRow>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FormFieldRow id="pu-start" label="Inizio *" error={errors.startDate?.message}>
            <Input id="pu-start" type="date" {...form.register('startDate')} disabled={disabled} />
          </FormFieldRow>
          <FormFieldRow id="pu-flow" label="Fioritura" error={errors.floweringDate?.message}>
            <Input
              id="pu-flow"
              type="date"
              {...form.register('floweringDate')}
              disabled={disabled}
            />
          </FormFieldRow>
          <div className="space-y-1">
            <FormFieldRow id="pu-harv" label="Raccolta" error={errors.harvestingDate?.message}>
              <Input
                id="pu-harv"
                type="date"
                disabled={disabled}
                {...form.register('harvestingDate', {
                  onChange: () => setIsHarvestManuallyEdited(true),
                })}
              />
            </FormFieldRow>
            {suggestedHarvestDate ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={disabled}
                onClick={() => applySuggestedHarvest(true)}
              >
                Usa data suggerita
              </Button>
            ) : null}
          </div>
          <FormFieldRow id="pu-end" label="Fine *" error={errors.endDate?.message}>
            <Input id="pu-end" type="date" {...form.register('endDate')} disabled={disabled} />
          </FormFieldRow>
        </div>

        <FormFieldRow
          id="pu-water"
          label="Acqua totale periodo (L)"
          error={errors.acquaTotalePeridoL?.message}
        >
          <Input
            id="pu-water"
            type="number"
            inputMode="decimal"
            step="1"
            className="max-w-[8rem]"
            {...form.register('acquaTotalePeridoL', {
              setValueAs: (value) => {
                if (value === '' || value == null) return null;
                const parsed = Number(value);
                return Number.isFinite(parsed) ? parsed : null;
              },
            })}
            disabled={disabled}
          />
        </FormFieldRow>
      </section>

      <DetailActions disabled={disabled} onBack={onBack} />
    </form>
  );
}

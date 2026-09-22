import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
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
  DateRange,
  FieldAllocation,
  ProductionUnitDraft,
} from '@/components/organisms/manual-add/production-units-wizard-types';
import { totalAllocatedHa } from '@/components/organisms/manual-add/production-units-wizard-types';

interface ProductionUnitsWizardStepDetailProps {
  readonly allocations: readonly FieldAllocation[];
  readonly dateRange: DateRange;
  readonly initialDraft: ProductionUnitDraft | null;
  readonly disabled?: boolean;
  readonly onBack: () => void;
  readonly onSave: (draft: ProductionUnitDraft) => void;
}

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

  const defaultValues: ProductionUnitDetailInput = {
    name: initialDraft?.name ?? '',
    cropCode: initialDraft?.cropCode ?? '',
    cropName: initialDraft?.cropName ?? '',
    cropType: initialDraft?.cropType ?? '',
    variety: initialDraft?.variety ?? '',
    protocoll: initialDraft?.protocoll ?? 'Convenzionale',
    protectionStructure: initialDraft?.protectionStructure ?? 'Nessuna',
    startDate: initialDraft?.startDate || dateRange.start,
    floweringDate: initialDraft?.floweringDate ?? '',
    harvestingDate: initialDraft?.harvestingDate ?? '',
    endDate: initialDraft?.endDate || dateRange.end,
    acquaTotalePeridoL: initialDraft?.acquaTotalePeridoL ?? null,
    occupazione: initialDraft?.occupazione ?? '',
    destinazioneDiUso: initialDraft?.destinazioneDiUso ?? '',
  };

  const form = useForm<ProductionUnitDetailInput, unknown, ProductionUnitDetailValues>({
    resolver: zodResolver(productionUnitDetailSchema),
    defaultValues,
  });

  const cropCode = form.watch('cropCode');
  const variety = form.watch('variety');
  const startDate = form.watch('startDate');
  const cropEntry = cropCode ? byCode.get(cropCode) : undefined;
  const { options: varietyOptions, catalog, isLoading: isLoadingVarieties } =
    useCultivarOptions(cropCode);

  const suggestedHarvestDate = useMemo(() => {
    if (!catalog || !cropCode || !variety.trim()) return null;
    return catalog.getRecommendedHarvestDate({
      cropCode,
      variety,
      periodStart: startDate || dateRange.start,
    });
  }, [catalog, cropCode, dateRange.start, startDate, variety]);

  function applySuggestedHarvest(force = false) {
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
  }

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
  }, [cropEntry, dateRange.start, form, initialDraft?.floweringDate, initialDraft?.harvestingDate]);

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
  }, [variety, suggestedHarvestDate]);

  const handleSubmit = form.handleSubmit((values) => {
    const draft: ProductionUnitDraft = {
      id: initialDraft?.id ?? `pu-${Date.now()}`,
      name: values.name.trim(),
      cropCode: values.cropCode,
      cropName: values.cropName,
      cropType: values.cropType,
      variety: values.variety.trim(),
      protocoll: values.protocoll.trim(),
      protectionStructure: values.protectionStructure.trim(),
      startDate: values.startDate,
      floweringDate: values.floweringDate,
      harvestingDate: values.harvestingDate,
      endDate: values.endDate,
      acquaTotalePeridoL: values.acquaTotalePeridoL ?? null,
      occupazione: values.occupazione?.trim() ?? '',
      destinazioneDiUso: values.destinazioneDiUso?.trim() ?? '',
      allocations,
    };
    onSave(draft);
  });

  const errors = form.formState.errors;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <section className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p>
          Superficie allocata: <strong>{totalHa.toLocaleString('it-IT')} ha</strong> su{' '}
          {allocations.length} {allocations.length === 1 ? 'campo' : 'campi'}
        </p>
      </section>

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
              placeholder={
                isLoadingVarieties ? 'Caricamento...' : 'Seleziona varietà'
              }
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
              value={form.watch('protocoll')}
              options={toSelectOptions(PROTOCOL_OPTIONS)}
              placeholder="Seleziona protocollo"
              searchPlaceholder="Cerca protocollo..."
              otherPlaceholder="Es. Natura 2000"
              disabled={disabled}
              onChange={(value) => form.setValue('protocoll', value, { shouldValidate: true })}
            />
          </FormFieldRow>
          <FormFieldRow id="pu-structure" label="Struttura *" error={errors.protectionStructure?.message}>
            <SearchableSelectWithOther
              value={form.watch('protectionStructure')}
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
          <FormFieldRow
            id="pu-occ"
            label="Uso suolo primario"
            error={errors.occupazione?.message}
          >
            <SearchableSelectWithOther
              value={form.watch('occupazione')}
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
              value={form.watch('destinazioneDiUso')}
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
            <Input id="pu-flow" type="date" {...form.register('floweringDate')} disabled={disabled} />
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

      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" disabled={disabled} onClick={onBack}>
          Indietro
        </Button>
        <Button type="submit" disabled={disabled}>
          Salva unità
        </Button>
      </div>
    </form>
  );
}

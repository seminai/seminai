import type { InputDosageAgent } from './index';
import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { JobHistoryManager } from './historyCollector';
import { RuleViolationDetail, DisciplinareActiveIngredientInfo } from '../../../../domain/dtos/rule-rag.types';
import type { AppliedRulePayload } from '../../../../domain/dtos/applied-rules.dto';
import { UnitScheduledJob } from './flowMatchCropTreatment';
import type { Prisma } from '@prisma/client';
import { ProductCategory } from '@prisma/client';
import { cleanRegNumber } from './cleanRegNumber';
import { Label, LabelDoseDetail, isFitoLabel } from '../../../../domain/dtos/label.dto';
import { AlertNotesDTO } from '../../../../domain/dtos/alert-notes.dto';
import { roundQuantity, convertDoseToHl, calculateWaterForJob } from './unitConversion';
import { formatRuleViolationsAsText } from './fillTheJob.part-02-format-rule-violations-as-text';

export type RequestedProduct = InputDosageAgent['products'][number];

// Note: resolveCycleId function moved to batchLoader.ts as resolveCycleIdFromCache
// to support batch loading and prevent N+1 queries

export interface FillTheJobInput {
  readonly units: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  readonly requestedProducts?: ReadonlyArray<RequestedProduct>;
  readonly queueJobId?: string;
  readonly historyManager?: JobHistoryManager;
  readonly ruleViolations?: ReadonlyArray<RuleViolationDetail>;
  readonly disciplinareInfoMap?: Map<string, ReadonlyArray<DisciplinareActiveIngredientInfo>>;
  /** Applied rules per (productionUnitId|productName) — populated by flowValidateRulesCompliance */
  readonly appliedRulesByProduct?: ReadonlyMap<string, ReadonlyArray<AppliedRulePayload>>;
  /** machineId da associare a tutti i job creati */
  readonly machineId?: string | null;
  /** userId (operatore) da associare a tutti i job creati */
  readonly operatorId?: string | null;
}

export interface FillTheJobOutput {
  readonly jobsByUnit: Map<string, ReadonlyArray<UnitScheduledJob>>;
  readonly warnings: ReadonlyArray<string>;
}

export type JobWithStocksAndProduct = Prisma.JobGetPayload<{
  include: { stocks: { include: { product: true } } };
}>;

export interface ProductSummary {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly registrationNumber: string | null;
  readonly category: ProductCategory;
}

export interface ProductionUnitMetadata {
  readonly productionUnitId: string;
  readonly productionUnitName: string | null;
  readonly companyId: string | null;
  readonly companyName: string | null;
  readonly warehouseId: string | null;
}

export const DEFAULT_PRICE_UNIT = 'EUR';

export const STOCK_IN_TYPE = 'IN';

export const STOCK_OUT_TYPE = 'OUT';

export function parseDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function normalizeQuantityUnit(unit?: string | null): string {
  if (!unit) {
    return 'kg';
  }
  const normalized = unit.toLowerCase().trim();
  if (normalized.includes('kg')) {
    return 'kg';
  }
  if (normalized.includes('l')) {
    return 'L';
  }
  if (normalized.includes('g')) {
    return 'g';
  }
  return unit;
}

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

export function normalizeRegistrationNumber(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (!raw || !/\d/.test(raw)) {
    return '';
  }
  return cleanRegNumber(raw);
}

/**
 * Extracts label from product object if available.
 */
export function extractLabelFromProduct(product: unknown): Label | null {
  const labelCandidate = (product as { label?: unknown }).label;
  if (labelCandidate && isFitoLabel(labelCandidate)) {
    return labelCandidate;
  }
  return null;
}

/**
 * Finds the best matching dose detail for a given crop.
 */
export function findMatchingDoseDetail(
  label: Label,
  cropName?: string,
  variety?: string,
): LabelDoseDetail | null {
  if (!label.dosaggi_dettagliati || label.dosaggi_dettagliati.length === 0) {
    return null;
  }
  const normalizedCrop = normalizeName(cropName ?? '');
  const normalizedVariety = normalizeName(variety ?? '');
  for (const dose of label.dosaggi_dettagliati) {
    const normalizedColtura = normalizeName(dose.coltura ?? '');
    if (
      normalizedColtura === normalizedCrop ||
      normalizedColtura.includes(normalizedCrop) ||
      normalizedCrop.includes(normalizedColtura) ||
      normalizedColtura === normalizedVariety ||
      normalizedColtura.includes(normalizedVariety) ||
      normalizedVariety.includes(normalizedColtura)
    ) {
      return dose;
    }
  }
  return label.dosaggi_dettagliati[0] ?? null;
}

export interface BuildAlertNotesParams {
  readonly label: Label | null;
  readonly treatment: {
    readonly epoca_impiego?: string | null;
    readonly fasce_rispetto_acqua?: string | null;
    readonly fasce_rispetto_colture?: string | null;
    readonly application?: string | null;
    readonly ddt_date_is_ok?: boolean | null;
    readonly ddt_date_conformity?: string | null;
    readonly ddt_date_after_treatment?: boolean | null;
  };
  readonly cropName?: string;
  readonly variety?: string;
  readonly totalStockRequired: number;
  readonly quantityUnit: string;
  readonly initialStockBalance: number;
  readonly treatedSurface: number | null;
  readonly ruleViolations?: ReadonlyArray<RuleViolationDetail>;
  readonly disciplinareInfo?: ReadonlyArray<DisciplinareActiveIngredientInfo> | null;
}

/**
 * Builds AlertNotesDTO from label data and LLM-selected values.
 * Stock out calculation: if totalStockRequired > initialStockBalance, the difference is stock_out.
 */
export function buildAlertNotes(params: BuildAlertNotesParams): AlertNotesDTO {
  const {
    label,
    treatment,
    cropName,
    variety,
    totalStockRequired,
    quantityUnit,
    initialStockBalance,
    treatedSurface,
  } = params;
  const doseDetail = label ? findMatchingDoseDetail(label, cropName, variety) : null;
  // Stock out = totale richiesto per tutti i job - stock disponibile iniziale
  // Se positivo, c'è stock out. Se negativo o zero, non c'è stock out.
  const stockOutAmount = totalStockRequired - initialStockBalance;
  const isStockOut = stockOutAmount > 0;
  // Calculate water for the job
  const waterValues = calculateWaterForJob({
    acquaMax: doseDetail?.acqua_max,
    acquaMaxUm: doseDetail?.acqua_max_um,
    treatedSurface,
  });
  // Calculate doses in hectoliters (only for fluids)
  const doseMinHlJob = convertDoseToHl({
    dose: doseDetail?.dose_minima,
    doseUm: doseDetail?.dose_um,
    treatedSurface,
  });
  const doseMaxHlJob = convertDoseToHl({
    dose: doseDetail?.dose_massima,
    doseUm: doseDetail?.dose_um,
    treatedSurface,
  });
  return {
    frasi_pericolo:
      label?.frasi_pericolo && label.frasi_pericolo.length > 0 ? label.frasi_pericolo : null,
    modalita_applicazione: doseDetail?.modalita_applicazione ?? null,
    n_max_applicazioni: doseDetail?.n_max_applicazioni ?? null,
    n_max_applicazioni_um: doseDetail?.n_max_applicazioni_um ?? null,
    dose_minima: doseDetail?.dose_minima ?? null,
    dose_massima: doseDetail?.dose_massima ?? null,
    dose_um: doseDetail?.dose_um ?? null,
    acqua_max: doseDetail?.acqua_max ?? null,
    acqua_max_um: doseDetail?.acqua_max_um ?? null,
    epoca_impiego: doseDetail?.epoca_impiego ?? null,
    note_tecniche: label?.note_tecniche ?? null,
    epoca_impiego_llm: treatment.epoca_impiego ?? treatment.application ?? null,
    fasce_di_rispetto_e_deriva:
      label?.fasce_di_rispetto_e_deriva && label.fasce_di_rispetto_e_deriva.length > 0
        ? label.fasce_di_rispetto_e_deriva
        : null,
    fasce_rispetto_acqua: label?.fasce_rispetto_acqua ?? null,
    fasce_rispetto_colture: label?.fasce_rispetto_colture ?? null,
    fasce_di_rispetto_e_deriva_llm:
      treatment.fasce_rispetto_acqua || treatment.fasce_rispetto_colture
        ? [treatment.fasce_rispetto_acqua, treatment.fasce_rispetto_colture]
            .filter(Boolean)
            .join('; ')
        : null,
    colture_target_fuori_periodo_di_produzione:
      label?.colture_target_fuori_periodo_di_prodizione &&
      label.colture_target_fuori_periodo_di_prodizione.length > 0
        ? label.colture_target_fuori_periodo_di_prodizione
        : null,
    colture_target_fuori_periodo_di_produzione_llm: null,
    resistenze: label?.resistenze && label.resistenze.length > 0 ? label.resistenze : null,
    resistenze_llm: null,
    malattie: label?.malattie && label.malattie.length > 0 ? label.malattie : null,
    total_stock_required_for_jobs:
      totalStockRequired > 0 ? roundQuantity(totalStockRequired) : null,
    total_stock_required_for_jobs_um: totalStockRequired > 0 ? quantityUnit : null,
    stock_out: isStockOut ? roundQuantity(stockOutAmount) : null,
    stock_out_um: isStockOut ? quantityUnit : null,
    stock_in_warehouse: initialStockBalance > 0 ? roundQuantity(initialStockBalance) : null,
    stock_in_warehouse_um: initialStockBalance > 0 ? quantityUnit : null,
    ddt_date_is_ok: treatment.ddt_date_is_ok ?? null,
    ddt_date_conformity: treatment.ddt_date_conformity ?? null,
    ddt_date_after_treatment: treatment.ddt_date_after_treatment ?? null,
    waterHlJob: waterValues.waterHlJob,
    acquaMaxJob: waterValues.acquaMaxJob,
    acquaMaxJob_um: waterValues.acquaMaxJob_um,
    principio_attivo: label?.principio_attivo ?? null,
    dose_minima_hl_job: doseMinHlJob,
    dose_massima_hl_job: doseMaxHlJob,
    ruleViolations:
      params.ruleViolations && params.ruleViolations.length > 0 ? params.ruleViolations : null,
    ruleComplianceNotes:
      params.ruleViolations && params.ruleViolations.length > 0
        ? formatRuleViolationsAsText(params.ruleViolations)
        : null,
    disciplinare_info:
      params.disciplinareInfo && params.disciplinareInfo.length > 0
        ? params.disciplinareInfo
        : null,
  };
}

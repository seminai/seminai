import type { Label, LabelDoseDetail } from '../../../../domain/dtos/label.dto';
import type {
  AgronomicConstrainedProduct,
  AgronomicConstrainedTreatment,
  AgronomicConstrainedUnit,
  AgronomicPlanInput,
} from '../../../../domain/entities/agronomic-validation';
import type { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { normalizeDoseRange } from './unitConversion';
import { checkProductRevoked, buildRevokedExclusionMessage } from './revokedProductChecker';
import { resolveDoseRow } from './perCropDoseRowResolver';

interface RawProduct {
  readonly name?: string;
  readonly regNumber?: string | null;
  readonly label?: Label;
  readonly trattamenti?: ReadonlyArray<RawTreatment>;
}

interface RawTreatment {
  readonly data_distribuzione?: Date | string;
  readonly dose?: number;
  readonly dosaggio_um?: string;
  readonly epoca_impiego?: string;
}

interface NormalizedBounds {
  readonly min: number | null;
  readonly max: number | null;
}

export interface BuildAgronomicPlanInputParams {
  readonly dosageResults: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  readonly weatherEvaluated?: boolean;
}

/**
 * Re-assembles the agronomic validator input from `dosageResults`, attaching
 * the label-derived constraints each treatment must respect. Label bounds are
 * read from the product's retained `label` (the same data the optimizer used),
 * so no re-fetch or normalization drift occurs.
 */
export function buildAgronomicPlanInput(params: BuildAgronomicPlanInputParams): AgronomicPlanInput {
  return {
    units: params.dosageResults.map(buildUnit),
    weatherEvaluated: params.weatherEvaluated ?? true,
  };
}

function buildUnit(unit: UnitAllowedProductsWithDosageOutput): AgronomicConstrainedUnit {
  const cropName = unit.cropName ?? '';
  const products = (unit.products ?? [])
    .filter((product) => (product.trattamenti?.length ?? 0) > 0)
    .map((product) => buildProduct(product as RawProduct, cropName));
  return {
    productionUnitId: unit.unitProductionId,
    cropName,
    adversity: null,
    harvestingDate: toIso(unit.harvestingDate),
    products,
  };
}

function buildProduct(product: RawProduct, cropName: string): AgronomicConstrainedProduct {
  const productName = product.name ?? '';
  const registrationNumber = product.regNumber ?? null;
  // RegNumber-only: a generic-name match in the name fallback could wrongly
  // BLOCK a legal plan, so the backstop trusts only the authoritative regNumber.
  const revoke = checkProductRevoked(registrationNumber);
  const rows = product.label?.dosaggi_dettagliati ?? [];
  return {
    productName,
    registrationNumber,
    isRevoked: revoke.isRevoked,
    revokedReason: revoke.info ? buildRevokedExclusionMessage(revoke.info) : null,
    fasceRispettoAcqua: product.label?.fasce_rispetto_acqua ?? null,
    fasceRispettoColture: product.label?.fasce_rispetto_colture ?? null,
    bufferAreaApplied: false,
    treatments: (product.trattamenti ?? []).map((treatment) =>
      buildTreatment(treatment, rows, cropName),
    ),
  };
}

function buildTreatment(
  treatment: RawTreatment,
  rows: ReadonlyArray<LabelDoseDetail>,
  cropName: string,
): AgronomicConstrainedTreatment {
  const epoca = treatment.epoca_impiego ?? null;
  const match = rows.length > 0 ? resolveDoseRow({ rows, cropName, epoca }) : null;
  const row = match ? rows[match.index] : null;
  const bounds = row ? normalizeBounds(row) : { min: null, max: null };
  return {
    applicationDate: toIso(treatment.data_distribuzione),
    doseValue: numberOrNull(treatment.dose),
    doseUnit: treatment.dosaggio_um ?? null,
    epoca,
    labelDoseMin: bounds.min,
    labelDoseMax: bounds.max,
    labelPhiDays: numberOrNull(row?.intervallo_sicurezza_giorni),
    labelMinIntervalDays: numberOrNull(row?.intervallo_min_giorni),
    labelNMaxApplications: numberOrNull(row?.n_max_applicazioni),
    labelNMaxApplicationsUm: row?.n_max_applicazioni_um ?? null,
    doseRowConfidence: match?.confidence ?? 0,
  };
}

function normalizeBounds(row: LabelDoseDetail): NormalizedBounds {
  if (row.dose_minima == null && row.dose_massima == null) {
    return { min: null, max: null };
  }
  const normalized = normalizeDoseRange({
    min: row.dose_minima,
    max: row.dose_massima,
    unit: row.dose_um,
    waterVolume: row.acqua_max,
    waterVolumeUnit: row.acqua_max_um,
  });
  return {
    min: row.dose_minima == null ? null : normalized.min,
    max: row.dose_massima == null ? null : normalized.max,
  };
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

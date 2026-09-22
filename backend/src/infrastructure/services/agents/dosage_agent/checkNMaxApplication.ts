import { LabelDoseDetail } from '../../../../domain/dtos/label.dto';

interface ApplyNMaxApplicationsLimitParams<TApplication> {
  readonly applications: ReadonlyArray<TApplication>;
  readonly dosageDetails: ReadonlyArray<LabelDoseDetail>;
}

interface ApplyNMaxApplicationsLimitResult<TApplication> {
  readonly applications: ReadonlyArray<TApplication>;
  readonly wasLimited: boolean;
  readonly maxApplications: number | null;
}

function resolveMaxApplications(dosageDetails: ReadonlyArray<LabelDoseDetail>): number | null {
  const candidates = dosageDetails
    .map((d) => d.n_max_applicazioni)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  if (candidates.length === 0) {
    return null;
  }
  // Use the most permissive constraint: if a product is registered for 6 apps against
  // disease A and 4 against disease B, the product can be applied up to 6 times.
  // Per-disease limits are handled by the treatment planner through epoch matching.
  return Math.max(...candidates);
}

/**
 * Applies the label max-applications constraint (n_max_applicazioni) deterministically.
 *
 * Rules:
 * - If n_max_applicazioni is missing in the label, return the input unchanged.
 * - If applications.length <= n_max_applicazioni, return the input unchanged.
 * - If applications.length > n_max_applicazioni, trim the list to the first N items.
 *
 * Notes:
 * - This function intentionally does not interpret n_max_applicazioni_um (per-year/per-cycle/per-epoch).
 *   It is a safety clamp to prevent accidental over-generation from the LLM.
 */
export function applyNMaxApplicationsLimit<TApplication>(
  params: ApplyNMaxApplicationsLimitParams<TApplication>,
): ApplyNMaxApplicationsLimitResult<TApplication> {
  const maxApplications = resolveMaxApplications(params.dosageDetails);
  if (!maxApplications) {
    return { applications: params.applications, wasLimited: false, maxApplications: null };
  }
  if (params.applications.length <= maxApplications) {
    return { applications: params.applications, wasLimited: false, maxApplications };
  }
  return {
    applications: params.applications.slice(0, maxApplications),
    wasLimited: true,
    maxApplications,
  };
}

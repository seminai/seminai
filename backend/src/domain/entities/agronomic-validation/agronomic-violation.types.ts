/**
 * Domain types for the deterministic agronomic plan validator.
 *
 * The validator re-checks an already-assembled treatment plan against
 * label-derived constraints (max dose, pre-harvest interval, revocation, …)
 * and emits structured violations. It NEVER auto-corrects: it only reports,
 * so the human-in-the-loop approval flow stays authoritative.
 */

export type AgronomicSeverity = 'BLOCKING' | 'WARNING';

export type AgronomicViolationCode =
  | 'DOSE_ABOVE_LABEL_MAX'
  | 'DOSE_BELOW_LABEL_MIN'
  | 'PHI_VIOLATION'
  | 'MIN_INTERVAL_VIOLATION'
  | 'N_MAX_APPLICATIONS_EXCEEDED'
  | 'DOSE_ROW_UNRESOLVED'
  | 'BUFFER_ZONE_NOT_APPLIED'
  | 'REVOKED_PRODUCT'
  | 'SA_GROUP_DATA_MISSING'
  | 'SA_GROUP_EXCEEDED'
  | 'WEATHER_NOT_EVALUATED';

export type AgronomicViolationSource = 'label' | 'bdf' | 'ministerial' | 'disciplinari' | 'derived';

/** A violation as produced by a validator, before severity is stamped. */
export interface AgronomicFinding {
  readonly code: AgronomicViolationCode;
  readonly productionUnitId: string;
  readonly productName: string;
  readonly registrationNumber: string | null;
  readonly cropName: string;
  readonly adversity: string | null;
  /** Human-readable message (Italian, matches existing agent UX). */
  readonly message: string;
  /** Observed value that triggered the finding (e.g. computed dose / date). */
  readonly observed: number | string | null;
  /** Allowed limit (e.g. label max dose / latest legal date). */
  readonly limit: number | string | null;
  readonly source: AgronomicViolationSource;
}

/** A finding with its resolved severity, as returned by the orchestrator. */
export interface AgronomicViolation extends AgronomicFinding {
  readonly severity: AgronomicSeverity;
}

/** A single treatment with the label constraints attached (built by the assembler). */
export interface AgronomicConstrainedTreatment {
  /** ISO date of the planned application. */
  readonly applicationDate: string | null;
  /** Computed dose, already normalized to the base unit (kg/ha or L/ha). */
  readonly doseValue: number | null;
  readonly doseUnit: string | null;
  /** Free-text application timing (epoca) used to disambiguate the dose row. */
  readonly epoca: string | null;
  /** Label min dose, normalized to the same base unit. Null when absent. */
  readonly labelDoseMin: number | null;
  /** Label max dose, normalized to the same base unit. Null when absent. */
  readonly labelDoseMax: number | null;
  /** Pre-harvest interval (carenza) in days. Null when not applicable. */
  readonly labelPhiDays: number | null;
  /** Minimum interval between applications, in days. Null when not specified. */
  readonly labelMinIntervalDays: number | null;
  /** Max number of applications for the resolved row. Null when not specified. */
  readonly labelNMaxApplications: number | null;
  /** Scope of the application cap (e.g. "per anno", "per ciclo", "per epoca"). */
  readonly labelNMaxApplicationsUm: string | null;
  /** Confidence (0..1) that the resolved label dose row matches this treatment. */
  readonly doseRowConfidence: number;
}

export interface AgronomicConstrainedProduct {
  readonly productName: string;
  readonly registrationNumber: string | null;
  readonly isRevoked: boolean;
  readonly revokedReason: string | null;
  /** Label water buffer-zone text (fasce di rispetto da corpi idrici). */
  readonly fasceRispettoAcqua: string | null;
  /** Label crop buffer-zone text (fasce di rispetto da colture). */
  readonly fasceRispettoColture: string | null;
  /** Whether a buffer-zone area reduction was actually applied upstream. */
  readonly bufferAreaApplied: boolean;
  readonly treatments: ReadonlyArray<AgronomicConstrainedTreatment>;
}

export interface AgronomicConstrainedUnit {
  readonly productionUnitId: string;
  readonly cropName: string;
  readonly adversity: string | null;
  /** ISO harvest date; when null the PHI check is skipped (not verifiable). */
  readonly harvestingDate: string | null;
  readonly products: ReadonlyArray<AgronomicConstrainedProduct>;
}

export interface AgronomicPlanInput {
  readonly units: ReadonlyArray<AgronomicConstrainedUnit>;
  readonly weatherEvaluated: boolean;
}

export interface AgronomicValidationPolicy {
  /** Override the default severity for specific codes (e.g. make min-interval blocking). */
  readonly severityOverrides?: Partial<Record<AgronomicViolationCode, AgronomicSeverity>>;
  /** Minimum dose-row confidence required to trust label bounds (default 0.6). */
  readonly minDoseRowConfidence?: number;
}

export interface AgronomicValidationResult {
  readonly violations: ReadonlyArray<AgronomicViolation>;
  readonly blockingCount: number;
  readonly warningCount: number;
  /** Codes the validator actually evaluated — for "was this even checked?" transparency. */
  readonly checksRun: ReadonlyArray<AgronomicViolationCode>;
}

/** Below this confidence the label dose row is considered unresolved (fail-closed). */
export const DEFAULT_MIN_DOSE_ROW_CONFIDENCE = 0.6;

import type {
  AgronomicFinding,
  AgronomicPlanInput,
  AgronomicSeverity,
  AgronomicValidationPolicy,
  AgronomicValidationResult,
  AgronomicViolation,
  AgronomicViolationCode,
} from './agronomic-violation.types';
import { validateDoseMax } from './validate-dose-max';
import { validatePhi } from './validate-phi';
import { validateRevoked } from './validate-revoked';
import { validateMinInterval } from './validate-min-interval';
import { validateNMaxApplications } from './validate-n-max-applications';
import { validateBufferZones } from './validate-buffer-zones';

/**
 * Default severity per violation code. BLOCKING codes stop job creation
 * unless explicitly overridden; WARNING codes only annotate the plan.
 *
 * Rationale for BLOCKING choices:
 * - DOSE_ABOVE_LABEL_MAX / PHI_VIOLATION / REVOKED_PRODUCT: illegal output.
 * - DOSE_ROW_UNRESOLVED: cannot prove the dose is legal → fail closed.
 * - SA_GROUP_EXCEEDED: resistance-management breach.
 */
const DEFAULT_SEVERITY: Readonly<Record<AgronomicViolationCode, AgronomicSeverity>> = {
  DOSE_ABOVE_LABEL_MAX: 'BLOCKING',
  DOSE_BELOW_LABEL_MIN: 'WARNING',
  PHI_VIOLATION: 'BLOCKING',
  MIN_INTERVAL_VIOLATION: 'WARNING',
  N_MAX_APPLICATIONS_EXCEEDED: 'WARNING',
  DOSE_ROW_UNRESOLVED: 'BLOCKING',
  BUFFER_ZONE_NOT_APPLIED: 'WARNING',
  REVOKED_PRODUCT: 'BLOCKING',
  SA_GROUP_DATA_MISSING: 'WARNING',
  SA_GROUP_EXCEEDED: 'BLOCKING',
  WEATHER_NOT_EVALUATED: 'WARNING',
} as const;

/** Codes evaluated by the current check set (P0 + P1). */
const CHECKS_RUN: ReadonlyArray<AgronomicViolationCode> = [
  'DOSE_ABOVE_LABEL_MAX',
  'DOSE_BELOW_LABEL_MIN',
  'DOSE_ROW_UNRESOLVED',
  'PHI_VIOLATION',
  'REVOKED_PRODUCT',
  'MIN_INTERVAL_VIOLATION',
  'N_MAX_APPLICATIONS_EXCEEDED',
  'BUFFER_ZONE_NOT_APPLIED',
];

interface ValidateAgronomicPlanParams {
  readonly plan: AgronomicPlanInput;
  readonly policy?: AgronomicValidationPolicy;
}

/**
 * Runs the deterministic agronomic checks over an assembled plan and returns
 * structured violations with resolved severity. Pure: no IO, no mutation.
 */
export function validateAgronomicPlan(
  params: ValidateAgronomicPlanParams,
): AgronomicValidationResult {
  const { plan, policy } = params;
  const findings: AgronomicFinding[] = [
    ...validateDoseMax(plan, policy),
    ...validatePhi(plan),
    ...validateRevoked(plan),
    ...validateMinInterval(plan),
    ...validateNMaxApplications(plan),
    ...validateBufferZones(plan),
  ];
  const violations = findings.map<AgronomicViolation>((finding) => ({
    ...finding,
    severity: resolveSeverity(finding.code, policy),
  }));
  const blockingCount = violations.filter((v) => v.severity === 'BLOCKING').length;
  return {
    violations,
    blockingCount,
    warningCount: violations.length - blockingCount,
    checksRun: CHECKS_RUN,
  };
}

function resolveSeverity(
  code: AgronomicViolationCode,
  policy?: AgronomicValidationPolicy,
): AgronomicSeverity {
  return policy?.severityOverrides?.[code] ?? DEFAULT_SEVERITY[code];
}

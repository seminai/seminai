import { type UnitMeta } from './format-jobs-table';
import { type AgronomicViolation } from '../../../../../domain/entities/agronomic-validation';

export interface UnitSummary {
  unitId: string;
  jobCount: number;
}

export interface WmInputUnit {
  readonly id?: string;
  readonly name?: string | null;
  readonly cropName?: string | null;
  readonly variety?: string | null;
}

export function buildUnitMetaMap(inputUnits: unknown): Map<string, UnitMeta> {
  const map = new Map<string, UnitMeta>();
  if (!Array.isArray(inputUnits)) {
    return map;
  }
  for (const raw of inputUnits as ReadonlyArray<WmInputUnit>) {
    if (!raw?.id) continue;
    map.set(raw.id, {
      unitProductionId: raw.id,
      name: raw.name ?? null,
      cropName: raw.cropName ?? null,
      variety: raw.variety ?? null,
    });
  }
  return map;
}

/** Compact projection of a violation for tool JSON responses. */
export function compactViolation(violation: AgronomicViolation): Record<string, unknown> {
  return {
    code: violation.code,
    severity: violation.severity,
    product: violation.productName,
    crop: violation.cropName,
    observed: violation.observed,
    limit: violation.limit,
    message: violation.message,
  };
}

/** Result returned when the agronomic gate blocks job creation. */
export function buildAgronomicGateBlockedResult(blocking: ReadonlyArray<AgronomicViolation>): string {
  return JSON.stringify({
    blocked: true,
    requiresOverride: true,
    blockingViolations: blocking.map(compactViolation),
    message:
      `Creazione job BLOCCATA: ${blocking.length} violazioni agronomiche bloccanti. ` +
      "Presenta ogni violazione all'utente. Per procedere comunque, ri-chiama create_treatment_jobs " +
      "con overrideViolationCodes contenente i codici esplicitamente accettati dall'utente.",
    hint: 'Le violazioni di dose oltre il massimo, PHI e prodotti revocati indicano un piano potenzialmente illegale.',
  });
}

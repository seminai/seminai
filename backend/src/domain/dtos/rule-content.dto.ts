/**
 * Canonical structure of a Rule.content JSON payload.
 *
 * The Prisma `content` column is typed as `Json`, but this DTO documents
 * the expected shape produced by the FE rule editor and consumed by
 * companyRulesService when applying rules to dosage input.
 *
 * Additional keys (e.g. `dosageAgent`, `orchestrator`) are allowed and
 * consumed by `CompanyRulesService.extractConfigFromRuleContent`.
 */
export interface RuleContentPayload {
  readonly sezioni: ReadonlyArray<string>;
  readonly requisiti: ReadonlyArray<string>;
  readonly [extra: string]: unknown;
}

/**
 * Parses an unknown value into a RuleContentPayload, normalising arrays.
 * Returns null when the input cannot be interpreted as an object.
 */
export function parseRuleContent(value: unknown): RuleContentPayload | null {
  if (!isRecord(value)) return null;
  const sezioni = Array.isArray(value.sezioni)
    ? value.sezioni.filter((s): s is string => typeof s === 'string')
    : [];
  const requisiti = Array.isArray(value.requisiti)
    ? value.requisiti.filter((s): s is string => typeof s === 'string')
    : [];
  return { ...value, sezioni, requisiti };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

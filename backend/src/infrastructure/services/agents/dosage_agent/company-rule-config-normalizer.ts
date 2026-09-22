import { Prisma } from '@prisma/client';
import type { DosageStrategy } from './flowMatchProductionUnitTreatmentDosage';
import type { OrchestratorConfig } from './types';
import type { DosageRuleConfig } from './company-rule-config-types';

const DOSAGE_OBJECTIVE_VALUES: ReadonlyArray<NonNullable<OrchestratorConfig['objective']>> = [
  'minimize_interventions',
  'maximize_coverage',
  'balanced',
  'cost_effective',
];

const DOSAGE_INTENSITY_VALUES: ReadonlyArray<NonNullable<OrchestratorConfig['intensity']>> = [
  'low',
  'medium',
  'high',
];

const DOSAGE_STRATEGY_VALUES: ReadonlyArray<DosageStrategy> = ['min', 'max', 'avg', 'current'];

export function buildRuleConfig(
  content: Prisma.JsonValue,
  overrides: Prisma.JsonValue | null,
): DosageRuleConfig | null {
  const contentConfig = extractConfigFromRuleContent(content);
  const overrideConfig = overrides === null ? null : extractConfigFromRuleContent(overrides);
  return mergeConfigOverrides(contentConfig, overrideConfig);
}

export function listConfigFields(config: DosageRuleConfig): string[] {
  const fields = ['outStockLimiter', 'startAt', 'endAt', 'strategy'].filter(
    (field) => config[field as keyof DosageRuleConfig] !== undefined,
  );
  const orchestratorFields = Object.entries(config.orchestrator ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key]) => `orchestrator.${key}`);
  return [...fields, ...orchestratorFields];
}

export function mergeOrchestrator(
  base?: Partial<OrchestratorConfig> | null,
  overrides?: Partial<OrchestratorConfig> | null,
): Partial<OrchestratorConfig> | undefined {
  const merged: Partial<OrchestratorConfig> = {};
  copyDefinedOrchestratorFields(merged, base);
  copyDefinedOrchestratorFields(merged, overrides);
  return hasOrchestratorValues(merged) ? merged : undefined;
}

export function hasOrchestratorValues(orchestrator: Partial<OrchestratorConfig>): boolean {
  return Object.values(orchestrator).some((value) => value !== undefined);
}

export function stableStringify(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
}

function extractConfigFromRuleContent(content: Prisma.JsonValue): DosageRuleConfig | null {
  if (!isRecord(content)) return null;
  return normalizeConfig(content.dosageAgent) ?? normalizeConfig(content);
}

function copyDefinedOrchestratorFields(
  target: Partial<OrchestratorConfig>,
  source?: Partial<OrchestratorConfig> | null,
): void {
  if (!source) return;
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      (target as Record<string, unknown>)[key] = value;
    }
  }
}

function mergeConfigOverrides(
  baseConfig: DosageRuleConfig | null,
  overrideConfig: DosageRuleConfig | null,
): DosageRuleConfig | null {
  if (!baseConfig && !overrideConfig) return null;
  const config: DosageRuleConfig = {
    orchestrator: mergeOrchestrator(baseConfig?.orchestrator, overrideConfig?.orchestrator),
    outStockLimiter: overrideConfig?.outStockLimiter ?? baseConfig?.outStockLimiter,
    startAt: overrideConfig?.startAt ?? baseConfig?.startAt,
    endAt: overrideConfig?.endAt ?? baseConfig?.endAt,
    strategy: overrideConfig?.strategy ?? baseConfig?.strategy,
  };
  return hasConfigValues(config) ? config : null;
}

function normalizeConfig(value: unknown): DosageRuleConfig | null {
  if (!isRecord(value)) return null;
  const root = extractOrchestratorFromRoot(value);
  const nested = isRecord(value.orchestrator)
    ? extractOrchestratorFromRoot(value.orchestrator)
    : null;
  const maxDosi = getNumber(value.maxDosi);
  const alias = maxDosi === undefined ? null : { maxApplicationsPerProductPerUnit: maxDosi };
  const orchestrator = mergeOrchestrator(mergeOrchestrator(root, nested), alias);
  const config: DosageRuleConfig = {
    orchestrator: orchestrator ?? undefined,
    outStockLimiter: getBoolean(value.outStockLimiter),
    startAt: getDateOrString(value.startAt),
    endAt: getDateOrString(value.endAt),
    strategy: getStrategy(value.strategy),
  };
  return hasConfigValues(config) ? config : null;
}

function extractOrchestratorFromRoot(
  value: Record<string, unknown>,
): Partial<OrchestratorConfig> | null {
  const orchestrator: Partial<OrchestratorConfig> = {
    objective: getObjective(value.objective),
    intensity: getIntensity(value.intensity),
    maxProductsPerUnit: getNumber(value.maxProductsPerUnit),
    maxApplicationsPerProductPerUnit: getNumber(value.maxApplicationsPerProductPerUnit),
    maxTotalJobs: getNumber(value.maxTotalJobs),
    allowOutsideProductionTreatments: getBoolean(value.allowOutsideProductionTreatments),
    categoryPriority: getStringArray(value.categoryPriority),
    priorityTargets: getStringArray(value.priorityTargets),
    agronomicNotes: getString(value.agronomicNotes),
    useLlmForSelection: getBoolean(value.useLlmForSelection),
  };
  return hasOrchestratorValues(orchestrator) ? orchestrator : null;
}

function hasConfigValues(config: DosageRuleConfig): boolean {
  return (
    hasOrchestratorValues(config.orchestrator ?? {}) ||
    config.outStockLimiter !== undefined ||
    config.startAt !== undefined ||
    config.endAt !== undefined ||
    config.strategy !== undefined
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && !Number.isNaN(value) ? value : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function getDateOrString(value: unknown): Date | string | undefined {
  if (value instanceof Date) return value;
  return typeof value === 'string' ? value : undefined;
}

function getStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined;
}

function getObjective(value: unknown): OrchestratorConfig['objective'] | undefined {
  return typeof value === 'string' &&
    DOSAGE_OBJECTIVE_VALUES.includes(value as NonNullable<OrchestratorConfig['objective']>)
    ? (value as OrchestratorConfig['objective'])
    : undefined;
}

function getIntensity(value: unknown): OrchestratorConfig['intensity'] | undefined {
  return typeof value === 'string' &&
    DOSAGE_INTENSITY_VALUES.includes(value as NonNullable<OrchestratorConfig['intensity']>)
    ? (value as OrchestratorConfig['intensity'])
    : undefined;
}

function getStrategy(value: unknown): DosageStrategy | undefined {
  return typeof value === 'string' && DOSAGE_STRATEGY_VALUES.includes(value as DosageStrategy)
    ? (value as DosageStrategy)
    : undefined;
}

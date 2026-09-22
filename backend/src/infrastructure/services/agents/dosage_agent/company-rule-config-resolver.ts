import type { Rule } from '../../../../domain/entities/Rule';
import type { InputDosageAgent, OrchestratorConfig } from './types';
import {
  buildRuleConfig,
  hasOrchestratorValues,
  listConfigFields,
  mergeOrchestrator,
  stableStringify,
} from './company-rule-config-normalizer';
import type {
  AppliedCompanyRuleInfo,
  CompanyRuleConfigConflict,
  CompanyRuleConfigDiagnostics,
  DosageRuleConfig,
  RuleAssignmentWithRule,
} from './company-rule-config-types';

export type {
  CompanyRuleConfigConflict,
  CompanyRuleConfigDiagnostics,
  DosageRuleConfig,
  RuleAssignmentWithRule,
} from './company-rule-config-types';

type MutableConfig = {
  -readonly [K in keyof DosageRuleConfig]: DosageRuleConfig[K];
};

export function mergeCompanyRuleConfigs(
  ruleAssignments: ReadonlyArray<RuleAssignmentWithRule>,
): CompanyRuleConfigDiagnostics {
  const sorted = sortRuleAssignments(ruleAssignments);
  let mergedConfig: DosageRuleConfig | null = null;
  const ownerByField = new Map<string, string>();
  const conflicts: CompanyRuleConfigConflict[] = [];
  const appliedRules: AppliedCompanyRuleInfo[] = [];
  for (const item of sorted) {
    const config = buildRuleConfig(item.rule.content, item.assignment.overrides);
    if (!config) continue;
    appliedRules.push(toAppliedRuleInfo(item, config));
    const result = mergePriorityConfig({
      current: mergedConfig,
      incoming: config,
      incomingRule: item.rule,
      ownerByField,
    });
    mergedConfig = result.config;
    conflicts.push(...result.conflicts);
  }
  return {
    appliedRuleIds: appliedRules.map((rule) => rule.ruleId),
    appliedRules,
    finalConfig: mergedConfig,
    ignoredConflicts: conflicts,
  };
}

export function applyCompanyRuleConfigToInput(
  input: InputDosageAgent,
  config: DosageRuleConfig | null,
): InputDosageAgent {
  if (!config) return input;
  const orchestrator = mergeOrchestrator(input.orchestrator ?? undefined, config.orchestrator);
  return {
    ...input,
    orchestrator: orchestrator ?? input.orchestrator,
    outStockLimiter: config.outStockLimiter ?? input.outStockLimiter,
    startAt: config.startAt ?? input.startAt,
    endAt: config.endAt ?? input.endAt,
    strategy: config.strategy ?? input.strategy,
  };
}

function sortRuleAssignments(
  ruleAssignments: ReadonlyArray<RuleAssignmentWithRule>,
): RuleAssignmentWithRule[] {
  return [...ruleAssignments].sort((a, b) => {
    if (a.assignment.priority !== b.assignment.priority) {
      return a.assignment.priority - b.assignment.priority;
    }
    return getRuleUpdateDate(b.rule).getTime() - getRuleUpdateDate(a.rule).getTime();
  });
}

function toAppliedRuleInfo(
  item: RuleAssignmentWithRule,
  config: DosageRuleConfig,
): AppliedCompanyRuleInfo {
  return {
    ruleId: item.rule.id,
    ruleName: item.rule.name,
    assignmentId: item.assignment.id,
    priority: item.assignment.priority,
    fields: listConfigFields(config),
  };
}

function mergePriorityConfig(params: {
  readonly current: DosageRuleConfig | null;
  readonly incoming: DosageRuleConfig;
  readonly incomingRule: Rule;
  readonly ownerByField: Map<string, string>;
}): {
  readonly config: DosageRuleConfig;
  readonly conflicts: readonly CompanyRuleConfigConflict[];
} {
  const current = params.current ?? {};
  const conflicts: CompanyRuleConfigConflict[] = [];
  const config: MutableConfig = {
    ...current,
    orchestrator: current.orchestrator ? { ...current.orchestrator } : undefined,
  };
  mergeScalarField(config, params.incoming, 'outStockLimiter', params, conflicts);
  mergeScalarField(config, params.incoming, 'startAt', params, conflicts);
  mergeScalarField(config, params.incoming, 'endAt', params, conflicts);
  mergeScalarField(config, params.incoming, 'strategy', params, conflicts);
  config.orchestrator =
    mergePriorityOrchestrator(config.orchestrator, params, conflicts) ?? undefined;
  return { config, conflicts };
}

function mergeScalarField(
  current: MutableConfig,
  incoming: DosageRuleConfig,
  field: keyof Omit<DosageRuleConfig, 'orchestrator'>,
  params: { readonly incomingRule: Rule; readonly ownerByField: Map<string, string> },
  conflicts: CompanyRuleConfigConflict[],
): void {
  const value = incoming[field];
  if (value === undefined) return;
  const target = current as Record<string, unknown>;
  const currentValue = target[field];
  if (currentValue === undefined) {
    target[field] = value;
    params.ownerByField.set(field, params.incomingRule.id);
    return;
  }
  pushConflictIfDifferent(conflicts, params, field, currentValue, value);
}

function mergePriorityOrchestrator(
  current: Partial<OrchestratorConfig> | undefined,
  params: {
    readonly incoming: DosageRuleConfig;
    readonly incomingRule: Rule;
    readonly ownerByField: Map<string, string>;
  },
  conflicts: CompanyRuleConfigConflict[],
): Partial<OrchestratorConfig> | null {
  const incoming = params.incoming.orchestrator;
  if (!incoming) return current ?? null;
  const merged: Partial<OrchestratorConfig> = current ? { ...current } : {};
  for (const [key, value] of Object.entries(incoming)) {
    mergeOrchestratorField({ key, value, merged, params, conflicts });
  }
  return hasOrchestratorValues(merged) ? merged : null;
}

function mergeOrchestratorField(input: {
  readonly key: string;
  readonly value: unknown;
  readonly merged: Partial<OrchestratorConfig>;
  readonly params: {
    readonly incomingRule: Rule;
    readonly ownerByField: Map<string, string>;
  };
  readonly conflicts: CompanyRuleConfigConflict[];
}): void {
  if (input.value === undefined) return;
  const field = `orchestrator.${input.key}`;
  const currentValue = input.merged[input.key as keyof OrchestratorConfig];
  if (currentValue === undefined) {
    (input.merged as Record<string, unknown>)[input.key] = input.value;
    input.params.ownerByField.set(field, input.params.incomingRule.id);
    return;
  }
  pushConflictIfDifferent(input.conflicts, input.params, field, currentValue, input.value);
}

function pushConflictIfDifferent(
  conflicts: CompanyRuleConfigConflict[],
  params: { readonly incomingRule: Rule; readonly ownerByField: Map<string, string> },
  field: string,
  keptValue: unknown,
  ignoredValue: unknown,
): void {
  if (stableStringify(keptValue) === stableStringify(ignoredValue)) return;
  conflicts.push({
    ruleId: params.incomingRule.id,
    ruleName: params.incomingRule.name,
    field,
    keptRuleId: params.ownerByField.get(field) ?? 'input',
    keptValue,
    ignoredValue,
  });
}

function getRuleUpdateDate(rule: Rule): Date {
  return rule.updatedAt ?? rule.createdAt;
}

import { CompanyRulesService } from '../../dosage_agent/companyRulesService';
import type { DosageAgentContext } from '../../dosage_agent/context';
import type { InputDosageAgent, OrchestratorConfig } from '../../dosage_agent/types';
import type { DosageStrategy } from '../../dosage_agent/flowMatchProductionUnitTreatmentDosage';
import { PlanningWindow } from '../../dosage_agent/planningWindow';
import { stableStringify } from '../../dosage_agent/company-rule-config-normalizer';
import type { CompanyRuleConfigDiagnostics } from '../../dosage_agent/company-rule-config-types';
import {
  buildSyntheticDosageContext,
  resolveCompanyContext,
  type CompanyContextSource,
} from './company-context-resolver';

interface ResolveDosageSettingsParams {
  readonly threadId: string;
  readonly context?: DosageAgentContext;
  readonly userId?: string;
  readonly input: InputDosageAgent;
  readonly strategy?: DosageStrategy;
  readonly outStockLimiter?: boolean;
  readonly startAt?: string;
  readonly endAt?: string;
}

export type CompanyRuleDosageSettings =
  | {
      readonly kind: 'ready';
      readonly input: InputDosageAgent;
      readonly context?: DosageAgentContext;
      readonly companyId?: string;
      readonly companyContextSource?: CompanyContextSource;
      readonly companyRulesApplied: boolean;
      readonly companyRuleDiagnostics: CompanyRuleConfigDiagnostics;
      readonly dosageContextFingerprint: string;
      readonly strategy: DosageStrategy;
      readonly outStockLimiter: boolean;
      readonly planningWindow?: PlanningWindow;
      readonly orchestrator?: OrchestratorConfig;
    }
  | {
      readonly kind: 'multiple';
      readonly companyIds: readonly string[];
    };

/**
 * Applies effective company-rule configuration to direct ReAct dosage runs.
 */
export async function resolveCompanyRuleDosageSettings(
  params: ResolveDosageSettingsParams,
): Promise<CompanyRuleDosageSettings> {
  const requestedInput: InputDosageAgent = {
    ...params.input,
    strategy: params.strategy,
    outStockLimiter: params.outStockLimiter,
    startAt: params.startAt,
    endAt: params.endAt,
  };
  const resolvedCompany = resolveCompanyContext({
    threadId: params.threadId,
    context: params.context,
  });
  if (resolvedCompany.kind === 'multiple') {
    return { kind: 'multiple', companyIds: resolvedCompany.companyIds };
  }
  if (resolvedCompany.kind === 'none') {
    return buildReadySettings({
      requestedInput,
      effectiveInput: requestedInput,
      context: params.context,
      companyRulesApplied: false,
      companyRuleDiagnostics: createEmptyDiagnostics(),
    });
  }
  const effectiveContext =
    buildSyntheticDosageContext({
      threadId: params.threadId,
      userId: params.userId,
      context: params.context,
      companyId: resolvedCompany.companyId,
    }) ?? params.context;
  const ruleResult = await new CompanyRulesService().applyCompanyRulesWithDiagnostics({
    companyId: resolvedCompany.companyId,
    input: requestedInput,
  });
  return buildReadySettings({
    requestedInput,
    effectiveInput: ruleResult.input,
    context: effectiveContext,
    companyId: resolvedCompany.companyId,
    companyContextSource: resolvedCompany.source,
    companyRulesApplied: ruleResult.diagnostics.appliedRuleIds.length > 0,
    companyRuleDiagnostics: ruleResult.diagnostics,
  });
}

function buildReadySettings(params: {
  readonly requestedInput: InputDosageAgent;
  readonly effectiveInput: InputDosageAgent;
  readonly context?: DosageAgentContext;
  readonly companyId?: string;
  readonly companyContextSource?: CompanyContextSource;
  readonly companyRulesApplied: boolean;
  readonly companyRuleDiagnostics: CompanyRuleConfigDiagnostics;
}): Extract<CompanyRuleDosageSettings, { readonly kind: 'ready' }> {
  const strategy = params.effectiveInput.strategy ?? 'avg';
  return {
    kind: 'ready',
    input: params.effectiveInput,
    context: params.context,
    companyId: params.companyId,
    companyContextSource: params.companyContextSource,
    companyRulesApplied: params.companyRulesApplied,
    companyRuleDiagnostics: params.companyRuleDiagnostics,
    dosageContextFingerprint: buildDosageContextFingerprint(params),
    strategy,
    outStockLimiter: params.effectiveInput.outStockLimiter ?? false,
    planningWindow: buildPlanningWindow(params.effectiveInput.startAt, params.effectiveInput.endAt),
    orchestrator: params.effectiveInput.orchestrator,
  };
}

function buildDosageContextFingerprint(params: {
  readonly requestedInput: InputDosageAgent;
  readonly effectiveInput: InputDosageAgent;
  readonly companyId?: string;
  readonly companyRuleDiagnostics: CompanyRuleConfigDiagnostics;
}): string {
  return stableStringify({
    companyId: params.companyId ?? null,
    products: params.requestedInput.products,
    units: params.requestedInput.unitOfProduction,
    requested: {
      strategy: params.requestedInput.strategy,
      outStockLimiter: params.requestedInput.outStockLimiter,
      startAt: params.requestedInput.startAt,
      endAt: params.requestedInput.endAt,
      orchestrator: params.requestedInput.orchestrator,
    },
    effective: {
      strategy: params.effectiveInput.strategy,
      outStockLimiter: params.effectiveInput.outStockLimiter,
      startAt: params.effectiveInput.startAt,
      endAt: params.effectiveInput.endAt,
      orchestrator: params.effectiveInput.orchestrator,
    },
    rules: params.companyRuleDiagnostics,
  });
}

function createEmptyDiagnostics(): CompanyRuleConfigDiagnostics {
  return {
    appliedRuleIds: [],
    appliedRules: [],
    finalConfig: null,
    ignoredConflicts: [],
  };
}

function buildPlanningWindow(
  startAt: Date | string | undefined,
  endAt: Date | string | undefined,
): PlanningWindow | undefined {
  const start = toDate(startAt);
  const end = toDate(endAt);
  if (!start && !end) return undefined;
  return new PlanningWindow({ startAt: start, endAt: end });
}

function toDate(value: Date | string | undefined): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

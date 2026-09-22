import type { Rule } from '../../../../domain/entities/Rule';
import type { RuleOnCompany } from '../../../../domain/entities/RuleOnCompany';
import type { DosageStrategy } from './flowMatchProductionUnitTreatmentDosage';
import type { OrchestratorConfig } from './types';

export interface RuleAssignmentWithRule {
  readonly assignment: RuleOnCompany;
  readonly rule: Rule;
}

export interface DosageRuleConfig {
  readonly orchestrator?: Partial<OrchestratorConfig>;
  readonly outStockLimiter?: boolean;
  readonly startAt?: Date | string;
  readonly endAt?: Date | string;
  readonly strategy?: DosageStrategy;
}

export interface CompanyRuleConfigConflict {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly field: string;
  readonly keptRuleId: string;
  readonly keptValue: unknown;
  readonly ignoredValue: unknown;
}

export interface AppliedCompanyRuleInfo {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly assignmentId: string;
  readonly priority: number;
  readonly fields: readonly string[];
}

export interface CompanyRuleConfigDiagnostics {
  readonly appliedRuleIds: readonly string[];
  readonly appliedRules: readonly AppliedCompanyRuleInfo[];
  readonly finalConfig: DosageRuleConfig | null;
  readonly ignoredConflicts: readonly CompanyRuleConfigConflict[];
}

import type { InputDosageAgent } from './types';
import { PrismaRuleOnCompanyRepository } from '../../../repositories/PrismaRuleOnCompanyRepository';
import { PrismaRuleRepository } from '../../../repositories/PrismaRuleRepository';
import { prisma } from '../../../repositories/Prisma';
import { Rule } from '../../../../domain/entities/Rule';
import type { RuleOnCompany } from '../../../../domain/entities/RuleOnCompany';
import { VECTORIZABLE_RULE_CATEGORIES } from '../../../../domain/dtos/rule-rag.types';
import {
  applyCompanyRuleConfigToInput,
  mergeCompanyRuleConfigs,
  type CompanyRuleConfigDiagnostics,
  type RuleAssignmentWithRule,
} from './company-rule-config-resolver';

const ALLOWED_RULE_CATEGORIES: ReadonlyArray<Rule['category']> = [
  'CUSTOM',
  'BEST_PRACTICE',
  'DISCIPLINARE',
  'STANDARD',
  'METHODOLOGY',
];

export interface ApplyCompanyRulesResult {
  readonly input: InputDosageAgent;
  readonly diagnostics: CompanyRuleConfigDiagnostics;
}

const EMPTY_RULE_CONFIG_DIAGNOSTICS: CompanyRuleConfigDiagnostics = {
  appliedRuleIds: [],
  appliedRules: [],
  finalConfig: null,
  ignoredConflicts: [],
};

/**
 * Applies company-specific rules to dosage agent input.
 */
export class CompanyRulesService {
  private readonly ruleRepository: PrismaRuleRepository;
  private readonly ruleOnCompanyRepository: PrismaRuleOnCompanyRepository;

  constructor() {
    this.ruleRepository = new PrismaRuleRepository(prisma);
    this.ruleOnCompanyRepository = new PrismaRuleOnCompanyRepository(prisma);
  }

  /**
   * Applies active, valid company rules to the provided input.
   */
  public async applyCompanyRules(params: {
    readonly companyId?: string;
    readonly input: InputDosageAgent;
  }): Promise<InputDosageAgent> {
    const result = await this.applyCompanyRulesWithDiagnostics(params);
    return result.input;
  }

  /**
   * Applies company rules and returns the effective config diagnostics.
   */
  public async applyCompanyRulesWithDiagnostics(params: {
    readonly companyId?: string;
    readonly input: InputDosageAgent;
  }): Promise<ApplyCompanyRulesResult> {
    const { companyId, input } = params;
    if (!companyId) return { input, diagnostics: EMPTY_RULE_CONFIG_DIAGNOSTICS };
    const assignments = await this.ruleOnCompanyRepository.findActiveByCompanyId(companyId);
    if (assignments.length === 0) return { input, diagnostics: EMPTY_RULE_CONFIG_DIAGNOSTICS };
    const ruleAssignments = await this.resolveRuleAssignments(assignments);
    if (ruleAssignments.length === 0) return { input, diagnostics: EMPTY_RULE_CONFIG_DIAGNOSTICS };
    const diagnostics = mergeCompanyRuleConfigs(ruleAssignments);
    const enrichedInput = applyCompanyRuleConfigToInput(input, diagnostics.finalConfig);
    return { input: enrichedInput, diagnostics };
  }

  private async resolveRuleAssignments(
    assignments: ReadonlyArray<RuleOnCompany>,
  ): Promise<RuleAssignmentWithRule[]> {
    const resolved: RuleAssignmentWithRule[] = [];
    for (const assignment of assignments) {
      const rule = await this.ruleRepository.findById(assignment.ruleId);
      if (!rule) continue;
      if (!this.isAllowedCategory(rule.category)) continue;
      if (!rule.isActive() || !rule.isCurrentlyValid()) continue;
      resolved.push({ assignment, rule });
    }
    return resolved;
  }

  private isAllowedCategory(category: Rule['category']): boolean {
    return ALLOWED_RULE_CATEGORIES.includes(category);
  }

  /**
   * Retrieves vectorized rules assigned to a company for RAG compliance checks.
   */
  public async getVectorizedRulesForCompany(companyId: string): Promise<Rule[]> {
    const vectorizableCategories: ReadonlyArray<Rule['category']> = VECTORIZABLE_RULE_CATEGORIES;
    const assignments = await this.ruleOnCompanyRepository.findActiveByCompanyId(companyId);
    if (assignments.length === 0) {
      console.log(`[COMPANY-RULES] No active assignments found for company ${companyId}`);
      return [];
    }
    console.log(
      `[COMPANY-RULES] Found ${assignments.length} active assignments for company ${companyId}`,
    );
    const rules: Rule[] = [];
    for (const assignment of assignments) {
      const rule = await this.ruleRepository.findById(assignment.ruleId);
      if (!rule) {
        console.log(`[COMPANY-RULES] Rule ${assignment.ruleId} not found in DB`);
        continue;
      }
      if (!vectorizableCategories.includes(rule.category)) {
        console.log(
          `[COMPANY-RULES] Rule "${rule.name}" skipped: category ${rule.category} not vectorizable`,
        );
        continue;
      }
      if (!rule.isActive()) {
        console.log(
          `[COMPANY-RULES] Rule "${rule.name}" skipped: status=${rule.status} (not ACTIVE)`,
        );
        continue;
      }
      if (!rule.isCurrentlyValid()) {
        console.log(
          `[COMPANY-RULES] Rule "${rule.name}" skipped: not currently valid (validFrom=${rule.validFrom}, validUntil=${rule.validUntil})`,
        );
        continue;
      }
      if (!rule.hasVectorizedPdf()) {
        console.log(
          `[COMPANY-RULES] Rule "${rule.name}" skipped: not vectorized (isVectorized=${rule.isVectorized}, pdfFileUrl=${rule.pdfFileUrl ? 'set' : 'null'})`,
        );
        continue;
      }
      console.log(`[COMPANY-RULES] Rule "${rule.name}" (${rule.category}) passed all checks`);
      rules.push(rule);
    }
    return rules;
  }
}

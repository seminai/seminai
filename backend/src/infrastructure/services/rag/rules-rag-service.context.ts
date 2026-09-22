import { RuleCategory } from '@prisma/client';
import { VectorSearchQdrantService, QdrantSearchFilter } from '../tool/vectorSearchQdrant';
import { PrismaRuleRepository } from '../../repositories/PrismaRuleRepository';
import { PrismaRuleOnCompanyRepository } from '../../repositories/PrismaRuleOnCompanyRepository';
import { Rule } from '../../../domain/entities/Rule';
import { RuleComplianceResult, ProductComplianceValidation, RuleViolationDetail } from '../../../domain/dtos/rule-rag.types';
import { ValidateProductParams, QueryRulesParams, QueryRulesWithContextParams, RuleComplianceResultWithSource } from './rules-rag-service.support';

export interface RulesRagServiceContext {
  readonly ruleRepository: PrismaRuleRepository;
  readonly ruleOnCompanyRepository: PrismaRuleOnCompanyRepository;
  vectorService: VectorSearchQdrantService | null;
  getVectorService(): VectorSearchQdrantService;
  queryRulesForCompliance(params: QueryRulesParams): Promise<RuleComplianceResult[]>;
  queryRulesWithContext(params: QueryRulesWithContextParams): Promise<RuleComplianceResultWithSource[]>;
  validateProductCompliance(params: ValidateProductParams): Promise<ProductComplianceValidation>;
  getVectorizedRulesForCompany(companyId: string, categories?: ReadonlyArray<RuleCategory>): Promise<Rule[]>;
  getVectorizedRulesForWorkspace(workspaceId: string, categories?: ReadonlyArray<RuleCategory>): Promise<Rule[]>;
  buildQdrantFilter(workspaceId: string, ruleIds: string[]): QdrantSearchFilter;
  buildQdrantRuleIdsFilter(ruleIds: string[]): QdrantSearchFilter;
  buildComplianceQueries(params: {
    productName: string;
    activeIngredient: string;
    dose: number;
    doseUnit: string;
    applicationDate: Date;
    cropName: string;
    maxApplications?: number;
  }): Array<{ query: string; type: string }>;
  analyzeChunksForViolations(result: RuleComplianceResult, queryType: string, params: ValidateProductParams): RuleViolationDetail[];
  checkDoseViolation(text: string, dose: number, doseUnit: string, result: RuleComplianceResult, ruleCategory: RuleCategory): RuleViolationDetail | null;
  checkTimingViolation(text: string, applicationDate: Date, result: RuleComplianceResult, ruleCategory: RuleCategory): RuleViolationDetail | null;
  checkAuthorizationViolation(text: string, activeIngredient: string, result: RuleComplianceResult, ruleCategory: RuleCategory): RuleViolationDetail | null;
  checkGroupLimitViolation(text: string, activeIngredient: string, maxApplications: number | undefined, result: RuleComplianceResult, ruleCategory: RuleCategory): RuleViolationDetail | null;
  extractGroupLimitsFromText(text: string): Array<{ substances: string[]; maxInterventions: number; scope: 'anno' | 'ciclo' | null }>;
  parseSubstancesFromText(str: string): string[];
  normalizeActiveIngredient(value: string): string;
  ingredientBelongsToGroup(ingredient: string, substances: string[]): boolean;
  mapToViolationCategory(category: RuleCategory): RuleCategory | null;
}

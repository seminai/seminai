import { RuleCategory } from '@prisma/client';
import { VectorSearchQdrantService, QdrantSearchFilter } from '../tool/vectorSearchQdrant';
import { PrismaRuleRepository } from '../../repositories/PrismaRuleRepository';
import { PrismaRuleOnCompanyRepository } from '../../repositories/PrismaRuleOnCompanyRepository';
import { prisma } from '../../repositories/Prisma';
import { Rule } from '../../../domain/entities/Rule';
import { RuleComplianceResult, ProductComplianceValidation, RuleViolationDetail } from '../../../domain/dtos/rule-rag.types';
import { ValidateProductParams, QueryRulesParams, QueryRulesWithContextParams, RuleComplianceResultWithSource } from './rules-rag-service.support';
import type { RulesRagServiceContext } from './rules-rag-service.context';
import { rulesRagServiceGetVectorService } from './rules-rag-service.01-get-vector-service';
import { rulesRagServiceQueryRulesForCompliance } from './rules-rag-service.02-query-rules-for-compliance';
import { rulesRagServiceQueryRulesWithContext } from './rules-rag-service.03-query-rules-with-context';
import { rulesRagServiceValidateProductCompliance } from './rules-rag-service.04-validate-product-compliance';
import { rulesRagServiceGetVectorizedRulesForCompany } from './rules-rag-service.05-get-vectorized-rules-for-company';
import { rulesRagServiceGetVectorizedRulesForWorkspace } from './rules-rag-service.06-get-vectorized-rules-for-workspace';
import { rulesRagServiceBuildQdrantFilter } from './rules-rag-service.07-build-qdrant-filter';
import { rulesRagServiceBuildQdrantRuleIdsFilter } from './rules-rag-service.08-build-qdrant-rule-ids-filter';
import { rulesRagServiceBuildComplianceQueries } from './rules-rag-service.09-build-compliance-queries';
import { rulesRagServiceAnalyzeChunksForViolations } from './rules-rag-service.10-analyze-chunks-for-violations';
import { rulesRagServiceCheckDoseViolation } from './rules-rag-service.11-check-dose-violation';
import { rulesRagServiceCheckTimingViolation } from './rules-rag-service.12-check-timing-violation';
import { rulesRagServiceCheckAuthorizationViolation } from './rules-rag-service.13-check-authorization-violation';
import { rulesRagServiceCheckGroupLimitViolation } from './rules-rag-service.14-check-group-limit-violation';
import { rulesRagServiceExtractGroupLimitsFromText } from './rules-rag-service.15-extract-group-limits-from-text';
import { rulesRagServiceParseSubstancesFromText } from './rules-rag-service.16-parse-substances-from-text';
import { rulesRagServiceNormalizeActiveIngredient } from './rules-rag-service.17-normalize-active-ingredient';
import { rulesRagServiceIngredientBelongsToGroup } from './rules-rag-service.18-ingredient-belongs-to-group';
import { rulesRagServiceMapToViolationCategory } from './rules-rag-service.19-map-to-violation-category';

export { type RuleComplianceResultWithSource } from './rules-rag-service.support';

/**
 * Service for performing RAG (Retrieval Augmented Generation) queries
 * against vectorized rule PDFs stored in Qdrant.
 * Ensures multi-tenant data security by filtering on workspaceId and ruleIds.
 */
export class RulesRagService {

  readonly ruleRepository: PrismaRuleRepository;
  readonly ruleOnCompanyRepository: PrismaRuleOnCompanyRepository;
  vectorService: VectorSearchQdrantService | null = null;

  constructor() {
    this.ruleRepository = new PrismaRuleRepository(prisma);
    this.ruleOnCompanyRepository = new PrismaRuleOnCompanyRepository(prisma);
  }

  /**
   * Gets or creates the vector search service (lazy initialization).
   */
  getVectorService(): VectorSearchQdrantService {
    return rulesRagServiceGetVectorService.call(this as unknown as RulesRagServiceContext);
  }

  /**
   * Queries vectorized rule PDFs for compliance-related information.
   * Returns relevant chunks from rule documents that match the query.
   */
  public async queryRulesForCompliance(params: QueryRulesParams): Promise<RuleComplianceResult[]> {
    return rulesRagServiceQueryRulesForCompliance.call(this as unknown as RulesRagServiceContext, params);
  }

  /**
   * Queries vectorized rules with flexible context.
   * With companyId, searches company-assigned rules by default. Workspace rules
   * are included only when includeWorkspaceRules is explicitly true.
   */
  public async queryRulesWithContext(
    params: QueryRulesWithContextParams,
  ): Promise<RuleComplianceResultWithSource[]> {
    return rulesRagServiceQueryRulesWithContext.call(this as unknown as RulesRagServiceContext, params);
  }

  /**
   * Validates whether a specific product application complies with vectorized rules.
   * Builds a structured query and checks multiple compliance dimensions.
   */
  public async validateProductCompliance(
    params: ValidateProductParams,
  ): Promise<ProductComplianceValidation> {
    return rulesRagServiceValidateProductCompliance.call(this as unknown as RulesRagServiceContext, params);
  }

  /**
   * Retrieves vectorized rules that are active and assigned to a company.
   */
  async getVectorizedRulesForCompany(
    companyId: string,
    categories?: ReadonlyArray<RuleCategory>,
  ): Promise<Rule[]> {
    return rulesRagServiceGetVectorizedRulesForCompany.call(this as unknown as RulesRagServiceContext, companyId, categories);
  }

  /**
   * Retrieves all vectorized rules in a workspace regardless of company assignment.
   */
  async getVectorizedRulesForWorkspace(
    workspaceId: string,
    categories?: ReadonlyArray<RuleCategory>,
  ): Promise<Rule[]> {
    return rulesRagServiceGetVectorizedRulesForWorkspace.call(this as unknown as RulesRagServiceContext, workspaceId, categories);
  }

  /**
   * Builds a Qdrant filter that ensures multi-tenant data isolation.
   * LangChain stores document metadata under the "metadata" key in Qdrant payload,
   * so all field keys must be prefixed with "metadata."
   */
  buildQdrantFilter(workspaceId: string, ruleIds: string[]): QdrantSearchFilter {
    return rulesRagServiceBuildQdrantFilter.call(this as unknown as RulesRagServiceContext, workspaceId, ruleIds);
  }

  /**
   * Builds a Qdrant filter for company-assigned rules that can span multiple workspaces.
   * Rule IDs are globally unique, so sourceType + ruleIds is sufficient isolation here.
   */
  buildQdrantRuleIdsFilter(ruleIds: string[]): QdrantSearchFilter {
    return rulesRagServiceBuildQdrantRuleIdsFilter.call(this as unknown as RulesRagServiceContext, ruleIds);
  }

  /**
   * Builds multiple targeted queries for different compliance dimensions.
   * Updated to focus on disciplinare-specific data (intervention limits, substance groups).
   */
  buildComplianceQueries(params: {
    productName: string;
    activeIngredient: string;
    dose: number;
    doseUnit: string;
    applicationDate: Date;
    cropName: string;
    maxApplications?: number;
  }): Array<{ query: string; type: string }> {
    return rulesRagServiceBuildComplianceQueries.call(this as unknown as RulesRagServiceContext, params);
  }

  /**
   * Analyzes retrieved chunks to detect potential rule violations.
   * Uses keyword-based heuristics to identify compliance issues.
   */
  analyzeChunksForViolations(
    result: RuleComplianceResult,
    queryType: string,
    params: ValidateProductParams,
  ): RuleViolationDetail[] {
    return rulesRagServiceAnalyzeChunksForViolations.call(this as unknown as RulesRagServiceContext, result, queryType, params);
  }

  /**
   * Checks if the dose exceeds the maximum allowed according to rule content.
   */
  checkDoseViolation(
    text: string,
    dose: number,
    doseUnit: string,
    result: RuleComplianceResult,
    ruleCategory: RuleCategory,
  ): RuleViolationDetail | null {
    return rulesRagServiceCheckDoseViolation.call(this as unknown as RulesRagServiceContext, text, dose, doseUnit, result, ruleCategory);
  }

  /**
   * Checks if the application timing is appropriate according to rule content.
   */
  checkTimingViolation(
    text: string,
    applicationDate: Date,
    result: RuleComplianceResult,
    ruleCategory: RuleCategory,
  ): RuleViolationDetail | null {
    return rulesRagServiceCheckTimingViolation.call(this as unknown as RulesRagServiceContext, text, applicationDate, result, ruleCategory);
  }

  /**
   * Checks if an active ingredient is forbidden according to rule content.
   */
  checkAuthorizationViolation(
    text: string,
    activeIngredient: string,
    result: RuleComplianceResult,
    ruleCategory: RuleCategory,
  ): RuleViolationDetail | null {
    return rulesRagServiceCheckAuthorizationViolation.call(this as unknown as RulesRagServiceContext, text, activeIngredient, result, ruleCategory);
  }

  /**
   * Checks if treatments exceed group substance limits from disciplinari.
   * Patterns: "12 interventi tra Ditianon, Fluazinam e Folpet"
   */
  checkGroupLimitViolation(
    text: string,
    activeIngredient: string,
    maxApplications: number | undefined,
    result: RuleComplianceResult,
    ruleCategory: RuleCategory,
  ): RuleViolationDetail | null {
    return rulesRagServiceCheckGroupLimitViolation.call(this as unknown as RulesRagServiceContext, text, activeIngredient, maxApplications, result, ruleCategory);
  }

  /**
   * Extracts group limit patterns from Italian disciplinare text.
   */
  extractGroupLimitsFromText(
    text: string,
  ): Array<{ substances: string[]; maxInterventions: number; scope: 'anno' | 'ciclo' | null }> {
    return rulesRagServiceExtractGroupLimitsFromText.call(this as unknown as RulesRagServiceContext, text);
  }

  /**
   * Parses comma/e-separated substance names from text.
   */
  parseSubstancesFromText(str: string): string[] {
    return rulesRagServiceParseSubstancesFromText.call(this as unknown as RulesRagServiceContext, str);
  }

  /**
   * Normalizes an active ingredient name for comparison.
   * Removes accents, lowercases, and normalizes spacing.
   */
  normalizeActiveIngredient(value: string): string {
    return rulesRagServiceNormalizeActiveIngredient.call(this as unknown as RulesRagServiceContext, value);
  }

  /**
   * Checks if an ingredient belongs to a group of substances.
   */
  ingredientBelongsToGroup(ingredient: string, substances: string[]): boolean {
    return rulesRagServiceIngredientBelongsToGroup.call(this as unknown as RulesRagServiceContext, ingredient, substances);
  }

  /**
   * Maps a RuleCategory to a violation-compatible category.
   * All vectorizable categories are valid for violation detection.
   */
  mapToViolationCategory(category: RuleCategory): RuleCategory | null {
    return rulesRagServiceMapToViolationCategory.call(this as unknown as RulesRagServiceContext, category);
  }
}

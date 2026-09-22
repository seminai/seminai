import { RuleCategory } from '@prisma/client';
import {
  createVectorSearchQdrantService,
  VectorSearchQdrantService,
  QdrantSearchFilter,
} from '../tool/vectorSearchQdrant';
import { PrismaRuleRepository } from '../../repositories/PrismaRuleRepository';
import { PrismaRuleOnCompanyRepository } from '../../repositories/PrismaRuleOnCompanyRepository';
import { prisma } from '../../repositories/Prisma';
import { Rule } from '../../../domain/entities/Rule';
import {
  RuleComplianceResult,
  ProductComplianceValidation,
  RuleViolationDetail,
  RULES_QDRANT_COLLECTION,
  VECTORIZABLE_RULE_CATEGORIES,
} from '../../../domain/dtos/rule-rag.types';

/**
 * Parameters for validating product compliance against vectorized rules.
 */
interface ValidateProductParams {
  readonly companyId: string;
  readonly workspaceId: string;
  readonly productName: string;
  readonly activeIngredient: string;
  readonly dose: number;
  readonly doseUnit: string;
  readonly applicationDate: Date;
  readonly cropName: string;
  readonly maxApplications?: number;
}

/**
 * Parameters for querying rules for compliance information.
 */
interface QueryRulesParams {
  readonly companyId: string;
  readonly workspaceId: string;
  readonly query: string;
  readonly categories?: ReadonlyArray<RuleCategory>;
  readonly k?: number;
}

/**
 * Parameters for querying rules with flexible context (company and/or workspace).
 */
interface QueryRulesWithContextParams {
  readonly workspaceId: string;
  readonly companyId?: string;
  readonly query: string;
  readonly categories?: ReadonlyArray<RuleCategory>;
  readonly k?: number;
  readonly includeWorkspaceRules?: boolean;
}

/**
 * Compliance result tagged with its source (company-assigned vs workspace).
 */
export interface RuleComplianceResultWithSource extends RuleComplianceResult {
  readonly source: 'company' | 'workspace';
  readonly isPublic: boolean;
}

/**
 * Reads the page number from a Qdrant document metadata payload.
 * Returns undefined when the parser did not propagate page info.
 */
function extractPageFromMetadata(
  metadata: Record<string, unknown> | undefined,
): number | undefined {
  if (!metadata) return undefined;
  const candidates = [metadata.page, metadata.pageNumber];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Service for performing RAG (Retrieval Augmented Generation) queries
 * against vectorized rule PDFs stored in Qdrant.
 * Ensures multi-tenant data security by filtering on workspaceId and ruleIds.
 */
export class RulesRagService {
  private readonly ruleRepository: PrismaRuleRepository;
  private readonly ruleOnCompanyRepository: PrismaRuleOnCompanyRepository;
  private vectorService: VectorSearchQdrantService | null = null;

  constructor() {
    this.ruleRepository = new PrismaRuleRepository(prisma);
    this.ruleOnCompanyRepository = new PrismaRuleOnCompanyRepository(prisma);
  }

  /**
   * Gets or creates the vector search service (lazy initialization).
   */
  private getVectorService(): VectorSearchQdrantService {
    if (!this.vectorService) {
      this.vectorService = createVectorSearchQdrantService(RULES_QDRANT_COLLECTION);
    }
    return this.vectorService;
  }

  /**
   * Queries vectorized rule PDFs for compliance-related information.
   * Returns relevant chunks from rule documents that match the query.
   */
  public async queryRulesForCompliance(params: QueryRulesParams): Promise<RuleComplianceResult[]> {
    const { companyId, workspaceId, query, categories, k = 10 } = params;
    const vectorizedRules = await this.getVectorizedRulesForCompany(companyId, categories);
    if (vectorizedRules.length === 0) return [];
    const ruleIds = vectorizedRules.map((r) => r.id);
    const filter = this.buildQdrantFilter(workspaceId, ruleIds);
    const vectorService = this.getVectorService();
    const results = await vectorService.similaritySearchWithScore(query, k, filter);
    const ruleResultsMap = new Map<string, RuleComplianceResult>();
    for (const [doc, score] of results) {
      const ruleId = doc.metadata?.ruleId as string;
      if (!ruleId) continue;
      const rule = vectorizedRules.find((r) => r.id === ruleId);
      if (!rule) continue;
      const existing = ruleResultsMap.get(ruleId);
      const chunk = {
        content: doc.pageContent,
        chunkIndex: (doc.metadata?.chunkIndex as number) ?? 0,
        score,
        page: extractPageFromMetadata(doc.metadata),
      };
      if (existing) {
        (existing.relevantChunks as Array<typeof chunk>).push(chunk);
      } else {
        ruleResultsMap.set(ruleId, {
          ruleId,
          ruleName: rule.name,
          category: rule.category,
          score,
          relevantChunks: [chunk],
          isCompliant: true,
          violations: [],
        });
      }
    }
    return Array.from(ruleResultsMap.values());
  }

  /**
   * Queries vectorized rules with flexible context.
   * With companyId, searches company-assigned rules by default. Workspace rules
   * are included only when includeWorkspaceRules is explicitly true.
   */
  public async queryRulesWithContext(
    params: QueryRulesWithContextParams,
  ): Promise<RuleComplianceResultWithSource[]> {
    const { workspaceId, companyId, query, categories, k = 10, includeWorkspaceRules } = params;

    // Collect all rules and track which ones are company-assigned
    const companyRuleIds = new Set<string>();
    let allRules: Rule[];

    if (companyId) {
      // Fetch company-assigned rules
      const companyRules = await this.getVectorizedRulesForCompany(companyId, categories);
      for (const r of companyRules) companyRuleIds.add(r.id);

      // Merge, deduplicating by ID (company rules already included in workspace set)
      const ruleMap = new Map<string, Rule>();
      for (const r of companyRules) ruleMap.set(r.id, r);
      if (includeWorkspaceRules === true) {
        const workspaceRules = await this.getVectorizedRulesForWorkspace(workspaceId, categories);
        for (const r of workspaceRules) {
          if (!ruleMap.has(r.id)) ruleMap.set(r.id, r);
        }
      }
      allRules = Array.from(ruleMap.values());
    } else {
      allRules = await this.getVectorizedRulesForWorkspace(workspaceId, categories);
    }

    if (allRules.length === 0) return [];

    const ruleIds = allRules.map((r) => r.id);
    const filter = companyId
      ? this.buildQdrantRuleIdsFilter(ruleIds)
      : this.buildQdrantFilter(workspaceId, ruleIds);
    const vectorService = this.getVectorService();
    const results = await vectorService.similaritySearchWithScore(query, k, filter);

    const ruleResultsMap = new Map<string, RuleComplianceResultWithSource>();
    for (const [doc, score] of results) {
      const ruleId = doc.metadata?.ruleId as string;
      if (!ruleId) continue;
      const rule = allRules.find((r) => r.id === ruleId);
      if (!rule) continue;

      const source = companyRuleIds.has(ruleId) ? ('company' as const) : ('workspace' as const);
      const chunk = {
        content: doc.pageContent,
        chunkIndex: (doc.metadata?.chunkIndex as number) ?? 0,
        score,
        page: extractPageFromMetadata(doc.metadata),
      };

      const existing = ruleResultsMap.get(ruleId);
      if (existing) {
        (existing.relevantChunks as Array<typeof chunk>).push(chunk);
      } else {
        ruleResultsMap.set(ruleId, {
          ruleId,
          ruleName: rule.name,
          category: rule.category,
          score,
          relevantChunks: [chunk],
          isCompliant: true,
          violations: [],
          source,
          isPublic: rule.isPublic,
        });
      }
    }

    // Sort: company-assigned rules first, then by score
    return Array.from(ruleResultsMap.values()).sort((a, b) => {
      if (a.source !== b.source) return a.source === 'company' ? -1 : 1;
      return b.score - a.score;
    });
  }

  /**
   * Validates whether a specific product application complies with vectorized rules.
   * Builds a structured query and checks multiple compliance dimensions.
   */
  public async validateProductCompliance(
    params: ValidateProductParams,
  ): Promise<ProductComplianceValidation> {
    const {
      companyId,
      workspaceId,
      productName,
      activeIngredient,
      dose,
      doseUnit,
      applicationDate,
      cropName,
      maxApplications,
    } = params;
    const queries = this.buildComplianceQueries({
      productName,
      activeIngredient,
      dose,
      doseUnit,
      applicationDate,
      cropName,
      maxApplications,
    });
    const allViolations: RuleViolationDetail[] = [];
    const compliantRules: string[] = [];
    const recommendations: string[] = [];
    let totalScore = 0;
    let queryCount = 0;
    for (const queryInfo of queries) {
      const results = await this.queryRulesForCompliance({
        companyId,
        workspaceId,
        query: queryInfo.query,
        k: 5,
      });
      for (const result of results) {
        totalScore += result.score;
        queryCount++;
        const violations = this.analyzeChunksForViolations(result, queryInfo.type, params);
        if (violations.length > 0) {
          allViolations.push(...violations);
        } else {
          if (!compliantRules.includes(result.ruleName)) {
            compliantRules.push(result.ruleName);
          }
        }
      }
    }
    const overallScore = queryCount > 0 ? totalScore / queryCount : 0;
    const isCompliant = allViolations.every((v) => v.severity !== 'CRITICAL');
    return {
      isCompliant,
      overallScore,
      violations: allViolations,
      compliantRules,
      recommendations,
    };
  }

  /**
   * Retrieves vectorized rules that are active and assigned to a company.
   */
  private async getVectorizedRulesForCompany(
    companyId: string,
    categories?: ReadonlyArray<RuleCategory>,
  ): Promise<Rule[]> {
    const assignments = await this.ruleOnCompanyRepository.findActiveByCompanyId(companyId);
    if (assignments.length === 0) return [];
    const ruleIds = assignments.map((a) => a.ruleId);
    const vectorizedRules = await this.ruleRepository.findVectorizedByIds(ruleIds);
    // findVectorizedByIds does not filter by category, so apply it in memory
    const targetCategories = categories ?? VECTORIZABLE_RULE_CATEGORIES;
    return vectorizedRules.filter(
      (r) => targetCategories.includes(r.category) && r.isCurrentlyValid(),
    );
  }

  /**
   * Retrieves all vectorized rules in a workspace regardless of company assignment.
   */
  private async getVectorizedRulesForWorkspace(
    workspaceId: string,
    categories?: ReadonlyArray<RuleCategory>,
  ): Promise<Rule[]> {
    const rules = await this.ruleRepository.findVectorizedByWorkspaceId(workspaceId, categories);
    return rules.filter((r) => r.isCurrentlyValid());
  }

  /**
   * Builds a Qdrant filter that ensures multi-tenant data isolation.
   * LangChain stores document metadata under the "metadata" key in Qdrant payload,
   * so all field keys must be prefixed with "metadata."
   */
  private buildQdrantFilter(workspaceId: string, ruleIds: string[]): QdrantSearchFilter {
    // Build must conditions with workspace and sourceType
    // Note: LangChain uses "metadata" as the payload key for document metadata
    const mustConditions: QdrantSearchFilter['must'] = [
      { key: 'metadata.workspaceId', match: { value: workspaceId } },
      { key: 'metadata.sourceType', match: { value: 'rule_pdf' } },
    ];

    // If there's only one ruleId, add it to must for simpler filtering
    // If there are multiple ruleIds, use should for OR logic
    if (ruleIds.length === 1) {
      mustConditions.push({ key: 'metadata.ruleId', match: { value: ruleIds[0] } });
      return { must: mustConditions };
    }

    // For multiple rules, use should conditions (at least one must match)
    const shouldConditions = ruleIds.map((ruleId) => ({
      key: 'metadata.ruleId',
      match: { value: ruleId },
    }));
    return {
      must: mustConditions,
      should: shouldConditions,
    };
  }

  /**
   * Builds a Qdrant filter for company-assigned rules that can span multiple workspaces.
   * Rule IDs are globally unique, so sourceType + ruleIds is sufficient isolation here.
   */
  private buildQdrantRuleIdsFilter(ruleIds: string[]): QdrantSearchFilter {
    const mustConditions: QdrantSearchFilter['must'] = [
      { key: 'metadata.sourceType', match: { value: 'rule_pdf' } },
    ];
    if (ruleIds.length === 1) {
      mustConditions.push({ key: 'metadata.ruleId', match: { value: ruleIds[0] } });
      return { must: mustConditions };
    }
    const shouldConditions = ruleIds.map((ruleId) => ({
      key: 'metadata.ruleId',
      match: { value: ruleId },
    }));
    return { must: mustConditions, should: shouldConditions };
  }

  /**
   * Builds multiple targeted queries for different compliance dimensions.
   * Updated to focus on disciplinare-specific data (intervention limits, substance groups).
   */
  private buildComplianceQueries(params: {
    productName: string;
    activeIngredient: string;
    dose: number;
    doseUnit: string;
    applicationDate: Date;
    cropName: string;
    maxApplications?: number;
  }): Array<{ query: string; type: string }> {
    const month = params.applicationDate.toLocaleDateString('it-IT', { month: 'long' });
    return [
      // Primary query: Substance group intervention limits (most relevant for disciplinari)
      {
        query:
          `${params.activeIngredient} numero massimo interventi anno ` +
          `${params.cropName} vincolo gruppo sostanze attive disciplinare`,
        type: 'group_limit',
      },
      // Query for individual substance limits
      {
        query:
          `${params.activeIngredient} ${params.cropName} limitazioni uso note ` +
          `sostanza attiva interventi massimo`,
        type: 'substance_limit',
      },
      // Max applications query
      {
        query:
          `Numero massimo applicazioni trattamenti ${params.activeIngredient} ` +
          `${params.cropName} per anno per ciclo colturale`,
        type: 'max_applications',
      },
      // Timing/epoch query
      {
        query:
          `Epoca di impiego periodo applicazione ${params.activeIngredient} ` +
          `${params.cropName} ${month} calendario trattamenti`,
        type: 'timing',
      },
      // Authorization query
      {
        query:
          `${params.productName} ${params.activeIngredient} sostanza attiva ` +
          `autorizzata vietata ${params.cropName} limitazioni uso`,
        type: 'authorization',
      },
      // Interactions query
      {
        query:
          `interventi tra ${params.activeIngredient} gruppo sostanze attive ` +
          `${params.cropName} vincolo condiviso`,
        type: 'interactions',
      },
    ];
  }

  /**
   * Analyzes retrieved chunks to detect potential rule violations.
   * Uses keyword-based heuristics to identify compliance issues.
   */
  private analyzeChunksForViolations(
    result: RuleComplianceResult,
    queryType: string,
    params: ValidateProductParams,
  ): RuleViolationDetail[] {
    const violations: RuleViolationDetail[] = [];
    const ruleCategory = this.mapToViolationCategory(result.category);
    if (!ruleCategory) return violations;
    const combinedText = result.relevantChunks.map((c) => c.content.toLowerCase()).join(' ');
    if (queryType === 'dosage') {
      const doseViolation = this.checkDoseViolation(
        combinedText,
        params.dose,
        params.doseUnit,
        result,
        ruleCategory,
      );
      if (doseViolation) violations.push(doseViolation);
    }
    if (queryType === 'timing') {
      const timingViolation = this.checkTimingViolation(
        combinedText,
        params.applicationDate,
        result,
        ruleCategory,
      );
      if (timingViolation) violations.push(timingViolation);
    }
    if (queryType === 'authorization') {
      const authViolation = this.checkAuthorizationViolation(
        combinedText,
        params.activeIngredient,
        result,
        ruleCategory,
      );
      if (authViolation) violations.push(authViolation);
    }
    // Handle group limit validation for disciplinari
    if (
      queryType === 'group_limit' ||
      queryType === 'substance_limit' ||
      queryType === 'max_applications' ||
      queryType === 'interactions'
    ) {
      const groupViolation = this.checkGroupLimitViolation(
        combinedText,
        params.activeIngredient,
        params.maxApplications,
        result,
        ruleCategory,
      );
      if (groupViolation) violations.push(groupViolation);
    }
    return violations;
  }

  /**
   * Checks if the dose exceeds the maximum allowed according to rule content.
   */
  private checkDoseViolation(
    text: string,
    dose: number,
    doseUnit: string,
    result: RuleComplianceResult,
    ruleCategory: RuleCategory,
  ): RuleViolationDetail | null {
    const dosePatterns = [
      /dose\s*massima[:\s]*(\d+[.,]?\d*)\s*(kg|g|l|ml|kg\/ha|l\/ha|g\/hl|ml\/hl)/gi,
      /max[:\s]*(\d+[.,]?\d*)\s*(kg|g|l|ml|kg\/ha|l\/ha|g\/hl|ml\/hl)/gi,
    ];
    for (const pattern of dosePatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const maxDose = parseFloat(match[1].replace(',', '.'));
        if (!isNaN(maxDose) && dose > maxDose) {
          return {
            ruleId: result.ruleId,
            ruleName: result.ruleName,
            ruleCategory,
            violationType: 'DOSAGE_EXCEEDED',
            severity: 'CRITICAL',
            description: `Dose ${dose} ${doseUnit} exceeds maximum allowed ${maxDose} ${match[2]} from rule ${result.ruleName}`,
            suggestedAction: `Reduce dose to at most ${maxDose} ${match[2]}`,
            sourceChunk: result.relevantChunks[0]?.content?.substring(0, 200),
          };
        }
      }
    }
    return null;
  }

  /**
   * Checks if the application timing is appropriate according to rule content.
   */
  private checkTimingViolation(
    text: string,
    applicationDate: Date,
    result: RuleComplianceResult,
    ruleCategory: RuleCategory,
  ): RuleViolationDetail | null {
    const forbiddenKeywords = ['vietato', 'non consentito', 'non autorizzato', 'divieto'];
    const month = applicationDate.toLocaleDateString('it-IT', { month: 'long' }).toLowerCase();
    const hasForbidden = forbiddenKeywords.some((kw) => text.includes(kw));
    const mentionsMonth = text.includes(month);
    if (hasForbidden && mentionsMonth) {
      return {
        ruleId: result.ruleId,
        ruleName: result.ruleName,
        ruleCategory,
        violationType: 'WRONG_TIMING',
        severity: 'CRITICAL',
        description: `Application in ${month} may not be allowed according to rule ${result.ruleName}`,
        suggestedAction: 'Verify application timing against the rule document',
        sourceChunk: result.relevantChunks[0]?.content?.substring(0, 200),
      };
    }
    return null;
  }

  /**
   * Checks if an active ingredient is forbidden according to rule content.
   */
  private checkAuthorizationViolation(
    text: string,
    activeIngredient: string,
    result: RuleComplianceResult,
    ruleCategory: RuleCategory,
  ): RuleViolationDetail | null {
    const ingredientLower = activeIngredient.toLowerCase();
    const forbiddenPatterns = [
      `${ingredientLower}.*(?:vietato|non consentito|non autorizzato|revocato|sospeso)`,
      `(?:vietato|non consentito|non autorizzato|revocato|sospeso).*${ingredientLower}`,
    ];
    for (const pattern of forbiddenPatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(text)) {
          return {
            ruleId: result.ruleId,
            ruleName: result.ruleName,
            ruleCategory,
            violationType: 'FORBIDDEN_ACTIVE_INGREDIENT',
            severity: 'CRITICAL',
            description: `Active ingredient "${activeIngredient}" may be forbidden according to rule ${result.ruleName}`,
            suggestedAction: 'Use an alternative active ingredient allowed by the rule',
            sourceChunk: result.relevantChunks[0]?.content?.substring(0, 200),
          };
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Checks if treatments exceed group substance limits from disciplinari.
   * Patterns: "12 interventi tra Ditianon, Fluazinam e Folpet"
   */
  private checkGroupLimitViolation(
    text: string,
    activeIngredient: string,
    maxApplications: number | undefined,
    result: RuleComplianceResult,
    ruleCategory: RuleCategory,
  ): RuleViolationDetail | null {
    if (!maxApplications || maxApplications <= 0) return null;

    const groupLimits = this.extractGroupLimitsFromText(text);
    const normalizedIngredient = this.normalizeActiveIngredient(activeIngredient);

    for (const limit of groupLimits) {
      if (this.ingredientBelongsToGroup(normalizedIngredient, limit.substances)) {
        if (maxApplications > limit.maxInterventions) {
          return {
            ruleId: result.ruleId,
            ruleName: result.ruleName,
            ruleCategory,
            violationType: 'MAX_APPLICATIONS_EXCEEDED',
            severity: 'CRITICAL',
            description:
              `Numero interventi ${maxApplications} supera il limite di ${limit.maxInterventions} ` +
              `per il gruppo sostanze attive (${limit.substances.join(', ')}) ` +
              `secondo la regola ${result.ruleName}`,
            suggestedAction: `Ridurre a max ${limit.maxInterventions} interventi/anno per questo gruppo SA`,
            sourceChunk: result.relevantChunks[0]?.content?.substring(0, 300),
          };
        }
      }
    }
    return null;
  }

  /**
   * Extracts group limit patterns from Italian disciplinare text.
   */
  private extractGroupLimitsFromText(
    text: string,
  ): Array<{ substances: string[]; maxInterventions: number; scope: 'anno' | 'ciclo' | null }> {
    const limits: Array<{
      substances: string[];
      maxInterventions: number;
      scope: 'anno' | 'ciclo' | null;
    }> = [];

    // Pattern 1: "X interventi tra Sostanza1, Sostanza2 e Sostanza3"
    const pattern1 = /(\d+)\s+interventi?\s+tra\s+([^.|\n]{5,100})/gi;
    let match;
    while ((match = pattern1.exec(text)) !== null) {
      const maxInterventions = parseInt(match[1], 10);
      const substances = this.parseSubstancesFromText(match[2]);
      if (substances.length >= 2 && maxInterventions > 0) {
        limits.push({ substances, maxInterventions, scope: 'anno' });
      }
    }

    // Pattern 2: "massimo X trattamenti/anno" or "max X interventi"
    // Negative lookahead: skip if followed by "tra" (already captured by pattern 1)
    const pattern2 =
      /(?:massimo|max)\s+(\d+)\s+(?:trattament[io]|interventi?)(?:\/anno)?(?!\s+tra\s)/gi;
    while ((match = pattern2.exec(text)) !== null) {
      const maxInterventions = parseInt(match[1], 10);
      if (maxInterventions > 0) {
        limits.push({ substances: [], maxInterventions, scope: 'anno' });
      }
    }

    // Pattern 3: "N° max interventi: X" or "N. max interventi X" (table format)
    const pattern3 = /n[°.]?\s*max\s+interventi[:\s]*(\d+)/gi;
    while ((match = pattern3.exec(text)) !== null) {
      const maxInterventions = parseInt(match[1], 10);
      if (maxInterventions > 0) {
        limits.push({ substances: [], maxInterventions, scope: 'anno' });
      }
    }

    // Pattern 4: "Indipendentemente dall'avversità max X interventi"
    const pattern4 = /indipendentemente\s+dall['']avversit[aà]\s+max\s+(\d+)\s+interventi/gi;
    while ((match = pattern4.exec(text)) !== null) {
      const maxInterventions = parseInt(match[1], 10);
      if (maxInterventions > 0) {
        limits.push({ substances: [], maxInterventions, scope: 'anno' });
      }
    }

    // Deduplicate: remove generic limits (no substances) when a specific limit
    // with the same count exists. This prevents false positives from regex backtracking.
    const specificCounts = new Set(
      limits.filter((l) => l.substances.length >= 2).map((l) => l.maxInterventions),
    );
    return limits.filter(
      (l) => l.substances.length >= 2 || !specificCounts.has(l.maxInterventions),
    );
  }

  /**
   * Parses comma/e-separated substance names from text.
   */
  private parseSubstancesFromText(str: string): string[] {
    return str
      .split(/[,\/]|\s+e\s+|\s+o\s+/i)
      .map((s) => this.normalizeActiveIngredient(s))
      .filter((s) => s.length > 2 && !s.match(/^\d+$/));
  }

  /**
   * Normalizes an active ingredient name for comparison.
   * Removes accents, lowercases, and normalizes spacing.
   */
  private normalizeActiveIngredient(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /**
   * Checks if an ingredient belongs to a group of substances.
   */
  private ingredientBelongsToGroup(ingredient: string, substances: string[]): boolean {
    if (substances.length === 0) return true; // Generic limit applies to all
    return substances.some((s) => ingredient.includes(s) || s.includes(ingredient));
  }

  /**
   * Maps a RuleCategory to a violation-compatible category.
   * All vectorizable categories are valid for violation detection.
   */
  private mapToViolationCategory(category: RuleCategory): RuleCategory | null {
    if (VECTORIZABLE_RULE_CATEGORIES.includes(category)) return category;
    return null;
  }
}

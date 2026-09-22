/**
 * Rules Compliance Checker for Conformity Agent
 *
 * Validates jobs against vectorized rule PDFs (DISCIPLINARE, STANDARD, METHODOLOGY)
 * using RAG queries + LLM validation.
 *
 * Also extracts structured disciplinare info (SA group limits, max interventions)
 * which is shared with the SA group checker to avoid duplicate RAG queries.
 *
 * This is the most expensive check (multiple RAG + LLM calls per active ingredient).
 * Protected by circuit breaker in the orchestrator.
 */

import { RulesRagService } from '../../rag/RulesRagService';
import { DisciplinareInfoExtractor } from '../../rag/DisciplinareInfoExtractor';
import { CompanyRulesService } from '../dosage_agent/companyRulesService';
import type { DisciplinareActiveIngredientInfo } from '../../../../domain/dtos/rule-rag.types';
import type { ConformityViolation, JobWithRelations, ProductWithLabel } from './types';
import { findLabelForProduct, extractLabelFromExtraction } from './matchers';
import { ConformityCheckerContext } from './context';
import { Label } from '../../../../domain/dtos/label.dto';
import {
  ConformityCheckStep,
  ConformityDataSource,
  type JobHistoryManager,
} from './historyCollector';
import { resolveCropNamesForDisciplinare } from '../shared/cropNameResolver';

/**
 * Result of rules compliance check, including disciplinare info for downstream use.
 */
export interface RulesComplianceResult {
  readonly violations: Map<string, ConformityViolation[]>;
  readonly disciplinareInfoMap: Map<string, ReadonlyArray<DisciplinareActiveIngredientInfo>>;
  readonly resolvedCropNames: Map<string, string>;
}

/**
 * Extracts active ingredient string from a label
 */
function extractActiveIngredientFromLabel(label: Label | null): string | null {
  if (!label) return null;
  const raw = (label as unknown as Record<string, unknown>).principio_attivo;
  if (!raw || typeof raw !== 'string') return null;
  return raw.trim() || null;
}

/**
 * Extracts structured disciplinare info for each unique active ingredient via RAG + LLM.
 * Only processes rules with DISCIPLINARE category.
 */
async function extractDisciplinareInfo(params: {
  jobs: JobWithRelations[];
  labelByRegNumber: Map<string, ProductWithLabel['label']>;
  labelByProductName: Map<string, ProductWithLabel['label']>;
  vectorizedRules: ReadonlyArray<{
    id: string;
    name: string;
    category: string;
    pdfFileUrl: string | null;
    workspaceId: string;
  }>;
  ragService: RulesRagService;
  companyId: string;
  workspaceId: string;
  context?: ConformityCheckerContext;
  resolvedCropNames: Map<string, string>;
}): Promise<Map<string, ReadonlyArray<DisciplinareActiveIngredientInfo>>> {
  const {
    jobs,
    labelByRegNumber,
    labelByProductName,
    vectorizedRules,
    ragService,
    companyId,
    workspaceId,
    context,
    resolvedCropNames,
  } = params;
  const resultMap = new Map<string, ReadonlyArray<DisciplinareActiveIngredientInfo>>();

  const disciplinareRules = vectorizedRules.filter((r) => r.category === 'DISCIPLINARE');
  if (disciplinareRules.length === 0) {
    console.log('[RULES-COMPLIANCE-CHECKER] No DISCIPLINARE rules found, skipping info extraction');
    return resultMap;
  }

  // Collect unique active ingredients across all jobs
  const uniqueIngredients = new Set<string>();
  const cropNameForIngredient = new Map<string, string>();

  for (const job of jobs) {
    const product = job.stocks[0]?.product;
    if (!product) continue;

    const regNumber = product.registrationNumber ?? '';
    const productName = product.name ?? '';

    const labelExtraction = findLabelForProduct(
      regNumber,
      productName,
      labelByRegNumber as Map<string, ProductWithLabel['label']>,
      labelByProductName as Map<string, ProductWithLabel['label']>,
    );
    const label = extractLabelFromExtraction(labelExtraction);
    const ai = extractActiveIngredientFromLabel(label);
    if (ai) {
      uniqueIngredients.add(ai);
      if (!cropNameForIngredient.has(ai)) {
        const unitCropName = job.productionCycle?.cropName ?? 'unknown';
        const resolved = resolvedCropNames.get(unitCropName) ?? unitCropName;
        cropNameForIngredient.set(ai, resolved);
      }
    }
  }

  if (uniqueIngredients.size === 0) {
    console.log('[RULES-COMPLIANCE-CHECKER] No active ingredients found, skipping info extraction');
    return resultMap;
  }

  console.log(
    `[RULES-COMPLIANCE-CHECKER] Extracting disciplinare info for ${uniqueIngredients.size} unique active ingredients`,
  );

  const extractor = new DisciplinareInfoExtractor();

  // Process with controlled concurrency (max 3 parallel)
  const ingredients = Array.from(uniqueIngredients);
  const concurrency = Math.min(3, ingredients.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < ingredients.length) {
      // Safe in Node.js single-threaded event loop: increment and local capture
      // happen atomically (no await between them).
      const index = currentIndex++;
      const activeIngredient = ingredients[index];
      const cropName = cropNameForIngredient.get(activeIngredient) ?? 'unknown';
      const infos: DisciplinareActiveIngredientInfo[] = [];

      for (const rule of disciplinareRules) {
        try {
          // Query 1: with resolved crop name for targeted results
          const results = await ragService.queryRulesForCompliance({
            companyId,
            workspaceId,
            query: `${activeIngredient} ${cropName} interventi massimo avversità limitazioni uso note`,
            categories: ['DISCIPLINARE'],
            k: 5,
          });

          let ruleResult = results.find((r) => r.ruleId === rule.id);

          // Query 2 (fallback): without crop name for broader results
          if (!ruleResult || ruleResult.relevantChunks.length === 0) {
            const broaderResults = await ragService.queryRulesForCompliance({
              companyId,
              workspaceId,
              query: `${activeIngredient} interventi massimo avversità limitazioni uso note sostanza attiva`,
              categories: ['DISCIPLINARE'],
              k: 8,
            });
            ruleResult = broaderResults.find((r) => r.ruleId === rule.id);
          }

          if (ruleResult && ruleResult.relevantChunks.length > 0) {
            const info = await extractor.extractForActiveIngredient({
              activeIngredient,
              cropName,
              chunks: ruleResult.relevantChunks,
              ruleId: rule.id,
              ruleName: rule.name,
              pdfFileUrl: rule.pdfFileUrl,
              context: context
                ? {
                    userId: context.userId,
                    companyId,
                    jobId: context.jobId,
                  }
                : undefined,
            });
            if (info) {
              infos.push(info);
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `[RULES-COMPLIANCE-CHECKER] Disciplinare info extraction failed for ${activeIngredient}: ${msg}`,
          );
        }
      }

      if (infos.length > 0) {
        resultMap.set(activeIngredient.toLowerCase(), infos);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  console.log(
    `[RULES-COMPLIANCE-CHECKER] Disciplinare info extracted for ${resultMap.size}/${uniqueIngredients.size} ingredients`,
  );

  return resultMap;
}

/**
 * Checks rules compliance (RAG-based) for all jobs against company's vectorized rules.
 *
 * Also extracts structured disciplinare info for use by SA group checker.
 *
 * Skipped if:
 * - No companyId provided
 * - No vectorized rules found for the company
 *
 * Returns violations + disciplinareInfoMap + resolvedCropNames.
 */
export async function checkRulesCompliance(
  jobs: JobWithRelations[],
  labelByRegNumber: Map<string, ProductWithLabel['label']>,
  labelByProductName: Map<string, ProductWithLabel['label']>,
  companyId: string,
  context?: ConformityCheckerContext,
  historyManager?: JobHistoryManager,
): Promise<RulesComplianceResult> {
  const emptyResult: RulesComplianceResult = {
    violations: new Map(),
    disciplinareInfoMap: new Map(),
    resolvedCropNames: new Map(),
  };

  // Load company rules
  const companyRulesService = new CompanyRulesService();
  const vectorizedRules = await companyRulesService.getVectorizedRulesForCompany(companyId);

  if (vectorizedRules.length === 0) {
    console.log('[RULES-COMPLIANCE-CHECKER] No vectorized rules found for company, skipping');
    return emptyResult;
  }

  const workspaceId = vectorizedRules[0].workspaceId;
  console.log(
    `[RULES-COMPLIANCE-CHECKER] Validating against ${vectorizedRules.length} rules for company ${companyId}`,
  );

  const ragService = new RulesRagService();

  // Phase 1: Resolve crop names for disciplinare matching
  const hasDisciplinare = vectorizedRules.some((r) => r.category === 'DISCIPLINARE');
  const uniqueCropNames = [
    ...new Set(
      jobs.map((j) => j.productionCycle?.cropName).filter((cn): cn is string => Boolean(cn)),
    ),
  ];

  let resolvedCropNames = new Map<string, string>();
  if (hasDisciplinare && uniqueCropNames.length > 0) {
    console.log(
      `[RULES-COMPLIANCE-CHECKER] Resolving ${uniqueCropNames.length} crop names for disciplinare matching...`,
    );
    resolvedCropNames = await resolveCropNamesForDisciplinare({
      cropNames: uniqueCropNames,
      ragService,
      companyId,
      workspaceId,
    });
    for (const [short, full] of resolvedCropNames) {
      if (short !== full) {
        console.log(`[RULES-COMPLIANCE-CHECKER] Crop name resolved: "${short}" → "${full}"`);
      }
    }
  }

  // Phase 2: Extract structured disciplinare info
  const disciplinareInfoMap = await extractDisciplinareInfo({
    jobs,
    labelByRegNumber,
    labelByProductName,
    vectorizedRules,
    ragService,
    companyId,
    workspaceId,
    context,
    resolvedCropNames,
  });

  // Phase 3: Validate all products and collect violations
  const violationsByJobId = new Map<string, ConformityViolation[]>();

  for (const job of jobs) {
    const product = job.stocks[0]?.product;
    if (!product) continue;

    const regNumber = product.registrationNumber ?? '';
    const productName = product.name ?? '';

    // Get label to extract active ingredient
    const labelExtraction = findLabelForProduct(
      regNumber,
      productName,
      labelByRegNumber as Map<string, ProductWithLabel['label']>,
      labelByProductName as Map<string, ProductWithLabel['label']>,
    );
    const label = extractLabelFromExtraction(labelExtraction);
    const activeIngredient = extractActiveIngredientFromLabel(label);

    if (!activeIngredient) continue;
    if (job.quantity <= 0) continue;

    // Use resolved crop name for better RAG matching
    const rawCropName = job.productionCycle?.cropName ?? 'unknown';
    const cropName = resolvedCropNames.get(rawCropName) ?? rawCropName;
    const dose =
      job.productionUnit.areaHa > 0 ? job.quantity / job.productionUnit.areaHa : job.quantity;

    // Count all applications for this product on this unit
    const sameProductJobs = jobs.filter((j) => {
      const p = j.stocks[0]?.product;
      if (!p) return false;
      return (
        j.productionUnitId === job.productionUnitId &&
        (p.registrationNumber ?? '') === regNumber &&
        j.quantity > 0
      );
    });

    try {
      const validation = await ragService.validateProductCompliance({
        companyId,
        workspaceId,
        productName,
        activeIngredient,
        dose,
        doseUnit: job.unitOfMeasureQuantity,
        applicationDate: job.dateOfOpeation,
        cropName,
        maxApplications: sameProductJobs.length,
      });

      if (!validation.isCompliant && validation.violations.length > 0) {
        const mapSeverity = (s: string): 'ERROR' | 'WARNING' | 'INFO' => {
          if (s === 'CRITICAL') return 'ERROR';
          if (s === 'WARNING') return 'WARNING';
          return 'INFO';
        };

        // Enrich violation messages with disciplinare context when available
        const disciplinareInfo = disciplinareInfoMap.get(activeIngredient.toLowerCase());
        const disciplinareContext = disciplinareInfo
          ? ` [Disciplinare: max ${disciplinareInfo[0]?.n_max_interventi_sa ?? '?'} interventi SA, max ${disciplinareInfo[0]?.n_max_interventi_gruppo ?? '?'} interventi gruppo]`
          : '';

        const jobViolations: ConformityViolation[] = validation.violations.map((v) => ({
          type: 'RULES_COMPLIANCE_VIOLATION' as const,
          message:
            `[${v.ruleName}] ${v.description}${v.suggestedAction ? '. Azione suggerita: ' + v.suggestedAction : ''}${disciplinareContext}`.trim(),
          severity: mapSeverity(v.severity),
          source: 'RULES_RAG' as const,
          field: 'rules_compliance',
        }));

        violationsByJobId.set(job.id, jobViolations);

        if (historyManager) {
          historyManager.addEntry(
            job.productionUnitId,
            `${productName}|${regNumber}`,
            'Violazione disciplinari regionali',
            `${validation.violations.length} violazioni per ${productName}`,
            ConformityCheckStep.RULES_COMPLIANCE_CHECK,
            ConformityDataSource.RULES_RAG,
            {
              productionUnitId: job.productionUnitId,
              productName,
            },
          );
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[RULES-COMPLIANCE-CHECKER] Error validating ${productName}: ${msg}`);
      // Surface the failure as a warning violation so the user knows the check was skipped
      if (!violationsByJobId.has(job.id)) violationsByJobId.set(job.id, []);
      violationsByJobId.get(job.id)!.push({
        type: 'RULES_VALIDATION_FAILED',
        message: `Validazione disciplinari fallita per "${productName}": ${msg}. Il controllo normativo non è stato completato.`,
        severity: 'WARNING',
        source: 'RULES_RAG',
        field: 'rules_compliance',
      });
    }
  }

  console.log(
    `[RULES-COMPLIANCE-CHECKER] Found violations for ${violationsByJobId.size} jobs, disciplinare info for ${disciplinareInfoMap.size} ingredients`,
  );

  return {
    violations: violationsByJobId,
    disciplinareInfoMap,
    resolvedCropNames,
  };
}

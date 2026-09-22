import type { ConformityViolation, JobWithRelations, ProductWithLabel } from './types';
import { ConformityCheckerContext } from './context';
import { ConformityCheckStep, ConformityDataSource, type JobHistoryManager } from './historyCollector';
import { CompanyRulesService } from '../dosage_agent/companyRulesService';
import { RulesRagService } from '../../rag/RulesRagService';
import { resolveCropNamesForDisciplinare } from '../shared/cropNameResolver';
import { findLabelForProduct, extractLabelFromExtraction } from './matchers';
import { RulesComplianceResult, extractActiveIngredientFromLabel, extractDisciplinareInfo } from './rulesComplianceChecker.part-01-rules-compliance-result';

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

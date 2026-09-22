import type { ConformityViolation, JobWithRelations, ProductWithLabel } from './types';
import type { DisciplinareActiveIngredientInfo } from '../../../../domain/dtos/rule-rag.types';
import { Label } from '../../../../domain/dtos/label.dto';
import { RulesRagService } from '../../rag/RulesRagService';
import { ConformityCheckerContext } from './context';
import { findLabelForProduct, extractLabelFromExtraction } from './matchers';
import { DisciplinareInfoExtractor } from '../../rag/DisciplinareInfoExtractor';

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
export function extractActiveIngredientFromLabel(label: Label | null): string | null {
  if (!label) return null;
  const raw = (label as unknown as Record<string, unknown>).principio_attivo;
  if (!raw || typeof raw !== 'string') return null;
  return raw.trim() || null;
}

/**
 * Extracts structured disciplinare info for each unique active ingredient via RAG + LLM.
 * Only processes rules with DISCIPLINARE category.
 */
export async function extractDisciplinareInfo(params: {
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

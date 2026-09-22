import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { RulesRagService } from '../../rag/RulesRagService';
import { DosageAgentContext } from './context';
import { RuleViolationDetail, DisciplinareActiveIngredientInfo } from '../../../../domain/dtos/rule-rag.types';
import { extractActiveIngredient, buildDisciplinareInfoKey } from './productAccessors';
import { DisciplinareInfoExtractor } from '../../rag/DisciplinareInfoExtractor';

/**
 * Extracts structured disciplinare info for each unique active ingredient via LLM.
 * Only processes rules with DISCIPLINARE category.
 */
export async function extractDisciplinareInfo(params: {
  input: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
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
  context?: DosageAgentContext;
  resolvedCropNames: Map<string, string>;
}): Promise<Map<string, ReadonlyArray<DisciplinareActiveIngredientInfo>>> {
  const { input, vectorizedRules, ragService, companyId, workspaceId, context, resolvedCropNames } =
    params;
  const resultMap = new Map<string, ReadonlyArray<DisciplinareActiveIngredientInfo>>();

  const disciplinareRules = vectorizedRules.filter((r) => r.category === 'DISCIPLINARE');
  if (disciplinareRules.length === 0) {
    console.log('[RULES-COMPLIANCE] No DISCIPLINARE rules found, skipping info extraction');
    return resultMap;
  }

  // Collect unique active ingredient + crop combinations across all products.
  const extractionTargets = new Map<
    string,
    { activeIngredient: string; cropName: string; rawCropKey: string }
  >();
  for (const unit of input) {
    const unitCropName = unit.cropName ?? 'unknown';
    const resolvedCropName = resolvedCropNames.get(unitCropName) ?? unitCropName;
    for (const product of unit.products) {
      const ai = extractActiveIngredient(product);
      if (ai) {
        const targetKey = buildDisciplinareInfoKey(ai, resolvedCropName);
        if (!extractionTargets.has(targetKey)) {
          extractionTargets.set(targetKey, {
            activeIngredient: ai,
            cropName: resolvedCropName,
            rawCropKey: buildDisciplinareInfoKey(ai, unitCropName),
          });
        }
      }
    }
  }

  if (extractionTargets.size === 0) {
    console.log(
      '[RULES-COMPLIANCE] No active ingredient/crop combinations found in products, skipping info extraction',
    );
    return resultMap;
  }

  console.log(
    `[RULES-COMPLIANCE] Extracting disciplinare info for ${extractionTargets.size} active ingredient/crop combinations`,
  );

  const extractor = new DisciplinareInfoExtractor();

  // Process with controlled concurrency (max 3 parallel)
  const extractionEntries = Array.from(extractionTargets.entries());
  const concurrency = Math.min(3, extractionEntries.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < extractionEntries.length) {
      const index = currentIndex++;
      const [targetKey, target] = extractionEntries[index];
      const { activeIngredient, cropName, rawCropKey } = target;
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
            console.log(
              `[RULES-COMPLIANCE] No results for "${activeIngredient}" + "${cropName}", trying broader query`,
            );
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
            console.log(
              `[RULES-COMPLIANCE] Found ${ruleResult.relevantChunks.length} chunks for "${activeIngredient}" in rule "${rule.name}"`,
            );
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
                    companyId: context.companyId,
                    jobId: context.jobId,
                  }
                : undefined,
            });
            if (info) {
              console.log(
                `[RULES-COMPLIANCE] Extracted info for "${activeIngredient}": ` +
                  `avversita=${info.avversita.length}, grupo=${info.gruppo_sostanze_attive.length}`,
              );
              infos.push(info);
            } else {
              console.log(
                `[RULES-COMPLIANCE] LLM returned null for "${activeIngredient}" in rule "${rule.name}"`,
              );
            }
          } else {
            console.log(
              `[RULES-COMPLIANCE] No relevant chunks found for "${activeIngredient}" in rule "${rule.name}"`,
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `[RULES-COMPLIANCE] Disciplinare info extraction failed for ${activeIngredient}: ${msg}`,
          );
        }
      }

      if (infos.length > 0) {
        resultMap.set(targetKey, infos);
        if (rawCropKey !== targetKey) {
          resultMap.set(rawCropKey, infos);
        }
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  console.log(
    `[RULES-COMPLIANCE] Disciplinare info extracted for ${extractionEntries.length} active ingredient/crop combinations`,
  );

  return resultMap;
}

// extractProductName and extractActiveIngredient are imported from shared productAccessors

/**
 * Formats a list of violations as a human-readable note string.
 */
export function formatViolationsAsNote(violations: ReadonlyArray<RuleViolationDetail>): string {
  return violations
    .map(
      (v) =>
        `[RULE-${v.severity}] ${v.ruleName} (${v.ruleCategory}): ${v.description}` +
        (v.suggestedAction ? ` | Azione: ${v.suggestedAction}` : ''),
    )
    .join('\n');
}

/**
 * Deduplicates violations by ruleId + violationType + description.
 */
export function deduplicateViolations(
  violations: ReadonlyArray<RuleViolationDetail>,
): RuleViolationDetail[] {
  const seen = new Set<string>();
  return violations.filter((v) => {
    const key = `${v.ruleId}|${v.violationType}|${v.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

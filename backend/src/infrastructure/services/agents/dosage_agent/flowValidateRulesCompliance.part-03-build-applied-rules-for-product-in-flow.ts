import { RulesRagService } from '../../rag/RulesRagService';
import { RuleViolationDetail } from '../../../../domain/dtos/rule-rag.types';
import { type TreatmentView } from './productAccessors';
import type { AppliedRulePayload, AppliedRuleAdjustment } from '../../../../domain/dtos/applied-rules.dto';
import { buildAppliedRulesForProduct, citationsFromComplianceResults, groupViolationsByRule } from './appliedRulesBuilder';

/**
 * Builds the AppliedRulePayload[] for a single product, fetching citations from RAG
 * and aggregating violations + LLM adjustment summary.
 */
export async function buildAppliedRulesForProductInFlow(params: {
  readonly ragService: RulesRagService;
  readonly vectorizedRules: ReadonlyArray<{
    id: string;
    name: string;
    category: import('@prisma/client').RuleCategory;
    workspaceId: string;
    pdfFileUrl: string | null;
  }>;
  readonly companyRuleIds: ReadonlySet<string>;
  readonly companyId: string;
  readonly workspaceId: string;
  readonly productName: string;
  readonly activeIngredient: string;
  readonly resolvedCropName: string;
  readonly productViolations: ReadonlyArray<RuleViolationDetail>;
  readonly trattamentiPre: ReadonlyArray<TreatmentView>;
  readonly trattamentiPost: ReadonlyArray<TreatmentView>;
  readonly adjustmentSummary?: { motivazione: string; notaPerAgronomo: string };
}): Promise<ReadonlyArray<AppliedRulePayload>> {
  const {
    ragService,
    vectorizedRules,
    companyRuleIds,
    companyId,
    workspaceId,
    productName,
    activeIngredient,
    resolvedCropName,
    productViolations,
    trattamentiPre,
    trattamentiPost,
    adjustmentSummary,
  } = params;
  if (vectorizedRules.length === 0) return [];

  let citationsByRuleId = new Map<
    string,
    ReadonlyArray<import('../../../../domain/dtos/applied-rules.dto').AppliedRuleCitation>
  >();
  try {
    const ragResults = await ragService.queryRulesForCompliance({
      companyId,
      workspaceId,
      query: `${productName} ${activeIngredient} ${resolvedCropName} dose interventi limitazioni`,
      k: 8,
    });
    citationsByRuleId = citationsFromComplianceResults(ragResults);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[RULES-COMPLIANCE] Citation fetch failed for ${productName}: ${msg}`);
  }

  const violationsByRuleId = groupViolationsByRule(productViolations);

  const adjustments = buildAdjustmentsForProduct({
    productName,
    activeIngredient,
    trattamentiPre,
    trattamentiPost,
    adjustmentSummary,
  });
  const adjustmentsByRuleId = new Map<string, ReadonlyArray<AppliedRuleAdjustment>>();
  if (adjustments.length > 0) {
    const ruleIdsTouched = new Set<string>(
      productViolations.filter((v) => v.severity === 'CRITICAL').map((v) => v.ruleId),
    );
    for (const ruleId of ruleIdsTouched) {
      adjustmentsByRuleId.set(ruleId, adjustments);
    }
  }

  // Only include rules that actually had a signal: violation, citation, or adjustment.
  const relevantRules = vectorizedRules.filter(
    (r) =>
      violationsByRuleId.has(r.id) ||
      (citationsByRuleId.get(r.id)?.length ?? 0) > 0 ||
      adjustmentsByRuleId.has(r.id),
  );

  return buildAppliedRulesForProduct({
    rules: relevantRules,
    companyRuleIds,
    violationsByRuleId,
    citationsByRuleId,
    adjustmentsByRuleId,
  });
}

/**
 * Derives adjustment entries from pre/post treatment lists.
 * A treatment is considered "removed" when its dose was zeroed by the LLM.
 */
export function buildAdjustmentsForProduct(params: {
  readonly productName: string;
  readonly activeIngredient: string;
  readonly trattamentiPre: ReadonlyArray<TreatmentView>;
  readonly trattamentiPost: ReadonlyArray<TreatmentView>;
  readonly adjustmentSummary?: { motivazione: string; notaPerAgronomo: string };
}): AppliedRuleAdjustment[] {
  const { productName, activeIngredient, trattamentiPre, trattamentiPost, adjustmentSummary } =
    params;
  if (!adjustmentSummary) return [];
  const keptCount = trattamentiPost.filter((t) => (t.dose ?? 0) > 0).length;
  const removedCount = Math.max(0, trattamentiPre.length - keptCount);
  if (removedCount === 0 && !adjustmentSummary.motivazione) return [];
  return [
    {
      productName,
      activeIngredient,
      treatmentsKept: keptCount,
      treatmentsRemoved: removedCount,
      motivazione: adjustmentSummary.motivazione,
      notaPerAgronomo: adjustmentSummary.notaPerAgronomo || undefined,
    },
  ];
}

/**
 * Uses LLM to intelligently adjust treatments based on disciplinare constraints.
 * The LLM receives the structured disciplinare data (n_max_interventi_sa, n_max_interventi_gruppo, etc.)
 * and decides which treatments to keep and which to exclude.
 */
export interface AdjustTreatmentsResult {
  readonly trattamenti: TreatmentView[];
  readonly summary?: {
    readonly motivazione: string;
    readonly notaPerAgronomo: string;
  };
}

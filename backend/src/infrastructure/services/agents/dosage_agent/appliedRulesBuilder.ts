import type { RuleCategory } from '@prisma/client';
import type {
  AppliedRulePayload,
  AppliedRuleCitation,
  AppliedRuleAdjustment,
  AppliedRuleSource,
} from '../../../../domain/dtos/applied-rules.dto';
import type {
  RuleViolationDetail,
  RuleComplianceResult,
} from '../../../../domain/dtos/rule-rag.types';

/**
 * Minimal rule shape required to build an AppliedRulePayload.
 */
export interface AppliedRuleSourceData {
  readonly id: string;
  readonly name: string;
  readonly category: RuleCategory;
}

/**
 * Builds the AppliedRulePayload list for a single product, aggregating data
 * collected during the rules-compliance flow.
 */
export function buildAppliedRulesForProduct(params: {
  readonly rules: ReadonlyArray<AppliedRuleSourceData>;
  readonly companyRuleIds: ReadonlySet<string>;
  readonly violationsByRuleId: ReadonlyMap<string, ReadonlyArray<RuleViolationDetail>>;
  readonly citationsByRuleId: ReadonlyMap<string, ReadonlyArray<AppliedRuleCitation>>;
  readonly adjustmentsByRuleId: ReadonlyMap<string, ReadonlyArray<AppliedRuleAdjustment>>;
}): AppliedRulePayload[] {
  const { rules, companyRuleIds, violationsByRuleId, citationsByRuleId, adjustmentsByRuleId } =
    params;
  return rules.map((rule) =>
    buildPayload({
      rule,
      source: companyRuleIds.has(rule.id) ? 'company' : 'workspace',
      violations: violationsByRuleId.get(rule.id) ?? [],
      citations: citationsByRuleId.get(rule.id) ?? [],
      adjustments: adjustmentsByRuleId.get(rule.id) ?? [],
    }),
  );
}

/**
 * Maps RAG retrieval chunks to citation entries used in the persisted payload.
 */
export function citationsFromComplianceResults(
  results: ReadonlyArray<RuleComplianceResult>,
  topK = 3,
): Map<string, AppliedRuleCitation[]> {
  const byRule = new Map<string, AppliedRuleCitation[]>();
  for (const r of results) {
    const sorted = [...r.relevantChunks].sort((a, b) => b.score - a.score).slice(0, topK);
    byRule.set(
      r.ruleId,
      sorted.map((c) => ({
        chunkIndex: c.chunkIndex,
        snippet: truncateSnippet(c.content),
        score: c.score,
        page: c.page,
      })),
    );
  }
  return byRule;
}

/**
 * Groups violations by ruleId for fast lookup during payload assembly.
 */
export function groupViolationsByRule(
  violations: ReadonlyArray<RuleViolationDetail>,
): Map<string, RuleViolationDetail[]> {
  const grouped = new Map<string, RuleViolationDetail[]>();
  for (const v of violations) {
    const list = grouped.get(v.ruleId) ?? [];
    list.push(v);
    grouped.set(v.ruleId, list);
  }
  return grouped;
}

function buildPayload(params: {
  readonly rule: AppliedRuleSourceData;
  readonly source: AppliedRuleSource;
  readonly violations: ReadonlyArray<RuleViolationDetail>;
  readonly citations: ReadonlyArray<AppliedRuleCitation>;
  readonly adjustments: ReadonlyArray<AppliedRuleAdjustment>;
}): AppliedRulePayload {
  const { rule, source, violations, citations, adjustments } = params;
  const isCompliant = !violations.some((v) => v.severity === 'CRITICAL');
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    category: rule.category,
    source,
    isCompliant,
    citations,
    violations,
    adjustments,
  };
}

const SNIPPET_MAX_LEN = 400;

function truncateSnippet(text: string): string {
  if (text.length <= SNIPPET_MAX_LEN) return text;
  return `${text.slice(0, SNIPPET_MAX_LEN).trimEnd()}…`;
}

import type { RuleCategory } from '@prisma/client';
import type { RuleViolationDetail } from './rule-rag.types';

/**
 * Source of the rule assignment relative to the company that owns the job.
 * - 'company': rule is directly assigned to the company via RuleOnCompany
 * - 'workspace': rule is workspace-wide and not directly assigned
 */
export type AppliedRuleSource = 'company' | 'workspace';

/**
 * A single citation from a vectorized rule PDF, used for traceability in the UI.
 */
export interface AppliedRuleCitation {
  readonly chunkIndex: number;
  readonly snippet: string;
  readonly score: number;
  readonly page?: number;
}

/**
 * Adjustment performed by the LLM to align a product's treatments with rule constraints.
 */
export interface AppliedRuleAdjustment {
  readonly productName: string;
  readonly activeIngredient: string;
  readonly treatmentsKept: number;
  readonly treatmentsRemoved: number;
  readonly motivazione: string;
  readonly notaPerAgronomo?: string;
}

/**
 * Structured payload describing how a single rule was applied to a Job.
 * Persisted on Job.appliedRules (Json) for downstream display and audit.
 */
export interface AppliedRulePayload {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly category: RuleCategory;
  readonly source: AppliedRuleSource;
  readonly isCompliant: boolean;
  readonly citations: ReadonlyArray<AppliedRuleCitation>;
  readonly violations: ReadonlyArray<RuleViolationDetail>;
  readonly adjustments: ReadonlyArray<AppliedRuleAdjustment>;
}

import type { RuleCategory } from '@/types/workspace';

export type AppliedRuleSource = 'company' | 'workspace';

export type RuleViolationType =
  | 'DOSAGE_EXCEEDED'
  | 'DOSAGE_BELOW_MIN'
  | 'WRONG_TIMING'
  | 'FORBIDDEN_INTERACTION'
  | 'MAX_APPLICATIONS_EXCEEDED'
  | 'FORBIDDEN_ACTIVE_INGREDIENT'
  | 'OTHER';

export type RuleViolationSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface RuleViolationDetail {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly ruleCategory: RuleCategory;
  readonly violationType: RuleViolationType;
  readonly severity: RuleViolationSeverity;
  readonly description: string;
  readonly suggestedAction?: string;
  readonly sourceChunk?: string;
}

export interface AppliedRuleCitation {
  readonly chunkIndex: number;
  readonly snippet: string;
  readonly score: number;
  readonly page?: number;
}

export interface AppliedRuleAdjustment {
  readonly productName: string;
  readonly activeIngredient: string;
  readonly treatmentsKept: number;
  readonly treatmentsRemoved: number;
  readonly motivazione: string;
  readonly notaPerAgronomo?: string;
}

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

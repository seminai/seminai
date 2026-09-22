import type { RiskPolicy, RiskClassification } from '../shared/hitl/risk-policy';

/**
 * Tool names that require human approval before execution.
 * These are "destructive" operations that modify the database.
 */
const TOOLS_REQUIRING_APPROVAL: ReadonlyArray<string> = [
  'save_field_note',
  'save_stock_in_purchase',
  'save_stock_in_harvest',
  'save_stock_out_sale',
  'save_stock_out_treatment',
];

/**
 * RiskPolicy implementation for the field note agent.
 * Uses a static allow-list: any save operation requires approval.
 */
export const fieldNoteRiskPolicy: RiskPolicy = {
  classify(toolName: string): RiskClassification {
    if (TOOLS_REQUIRING_APPROVAL.includes(toolName)) {
      return { level: 'medium', score: 50, reason: 'Save operation requiring confirmation' };
    }
    return { level: 'low', score: 0, reason: 'Read-only analysis tool' };
  },
  requiresApproval(toolName: string): boolean {
    return TOOLS_REQUIRING_APPROVAL.includes(toolName);
  },
};

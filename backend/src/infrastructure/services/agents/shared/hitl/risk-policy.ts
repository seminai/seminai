/**
 * Generic risk classification result.
 * Agent-specific classifiers produce this structure.
 */
export interface RiskClassification {
  readonly level: 'low' | 'medium' | 'high';
  readonly score: number;
  readonly reason: string;
}

/**
 * Policy that any agent provides to decide which tool calls require human approval.
 * Used by `hitlApprove` for auto-continue decisions and by graph routing.
 */
export interface RiskPolicy {
  /** Returns a full classification for the given tool call. */
  classify(toolName: string, args: Record<string, unknown>): RiskClassification;

  /** Shortcut: returns true if the tool call needs human approval. */
  requiresApproval(toolName: string, args: Record<string, unknown>): boolean;
}

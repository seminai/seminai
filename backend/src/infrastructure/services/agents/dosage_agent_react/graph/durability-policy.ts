export type GraphDurabilityMode = 'async' | 'sync';

/**
 * Default durability for regular conversational turns.
 */
export function getConversationDurability(): GraphDurabilityMode {
  return 'async';
}

/**
 * Stronger durability for approval resumes that may execute mutating tools.
 */
export function getApprovalDurability(): GraphDurabilityMode {
  return 'sync';
}

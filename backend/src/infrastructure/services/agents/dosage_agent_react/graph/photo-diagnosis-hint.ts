/**
 * Builds the per-turn instruction used after a photo diagnosis tool call.
 */
export function buildPhotoDiagnosisFinalReplyHint(
  successfulToolsThisTurn: readonly string[],
): string | undefined {
  if (!successfulToolsThisTurn.includes('diagnose_from_photo')) return undefined;
  return [
    '## Photo Diagnosis Final Reply',
    'diagnose_from_photo has already run in this turn. Write the final user-facing answer now.',
    'Keep it brief: visible symptoms, possible causes, severity, recommended actions, and follow-up questions if needed.',
    'Do not call recommend_best_products, search_products, calculate_dosage, or planning tools unless the user explicitly asks in a later turn.',
  ].join('\n');
}

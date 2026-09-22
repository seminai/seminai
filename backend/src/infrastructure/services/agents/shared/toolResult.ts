/**
 * Shared utility for consistent tool result formatting across all agents.
 * All agent tools should use these helpers to return results,
 * so the LLM receives a predictable JSON structure.
 */

/**
 * Returns a successful tool result as JSON string.
 */
export function toolSuccess(data: Record<string, unknown>): string {
  return JSON.stringify({ success: true, ...data });
}

/**
 * Returns an error tool result as JSON string.
 * Optionally includes a hint for the agent to self-correct.
 */
export function toolError(message: string, hint?: string): string {
  return JSON.stringify({ error: message, ...(hint ? { hint } : {}) });
}

/**
 * Returns a prerequisite-missing tool result as JSON string.
 * Used when a tool requires data from a previous tool in the pipeline.
 */
export function toolMissingPrerequisite(key: string, hint: string): string {
  return JSON.stringify({
    error: `Prerequisito mancante: ${key}`,
    hint,
  });
}

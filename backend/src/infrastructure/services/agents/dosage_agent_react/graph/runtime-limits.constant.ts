/**
 * Centralised runtime limits for the Dosage ReAct graph.
 * Single source of truth — every module imports from here.
 */
export const RUNTIME_LIMITS = {
  /** LangGraph recursion limit (max graph steps per invocation) */
  RECURSION_LIMIT: 50,
  /** Emit warning to conversation after this many tool calls */
  LOOP_WARNING_THRESHOLD: 8,
  /** Abort agent after this many tool calls */
  LOOP_CRITICAL_THRESHOLD: 15,
  /** Window size for repeating-pattern detection */
  LOOP_PATTERN_WINDOW: 6,
  /** Legacy same-tool warning window; argument-aware loop detection uses the stricter value below. */
  LOOP_REPEATED_TOOL_WINDOW: 5,
  /** Abort when the exact same tool is called repeatedly with the same arguments */
  LOOP_REPEATED_IDENTICAL_TOOL_WINDOW: 3,
  /** Base wall-clock time for a single app.stream() call (ms) */
  STREAM_TIMEOUT_MS: 5 * 60 * 1000,
  /** Extra time per planned task step (ms) */
  STREAM_TIMEOUT_EXTENSION_PER_STEP_MS: 30 * 1000,
  /** Bonus time when conformity check is in the pipeline (ms) */
  STREAM_TIMEOUT_CONFORMITY_BONUS_MS: 5 * 60 * 1000,
  /** Absolute maximum stream timeout (ms) */
  STREAM_TIMEOUT_MAX_MS: 15 * 60 * 1000,
  /** Max combined tokens (prompt + completion) per user message */
  MAX_TOKENS_PER_MESSAGE: 200_000,
} as const;

/** Tools that indicate a conformity check is likely in the pipeline. */
const CONFORMITY_TOOLS = new Set([
  'run_conformity_check',
  'confirm_conformity_check',
  'validate_compliance',
]);

/**
 * Computes an adaptive stream timeout based on the current task list
 * and whether conformity-related tools are expected.
 */
export function computeAdaptiveTimeout(
  taskList: ReadonlyArray<{ status: string }>,
  toolNames: ReadonlyArray<string> = [],
): number {
  const pendingSteps = taskList.filter(
    (t) => t.status === 'pending' || t.status === 'in_progress',
  ).length;
  const hasConformity = toolNames.some((name) => CONFORMITY_TOOLS.has(name));
  const timeout =
    RUNTIME_LIMITS.STREAM_TIMEOUT_MS +
    pendingSteps * RUNTIME_LIMITS.STREAM_TIMEOUT_EXTENSION_PER_STEP_MS +
    (hasConformity ? RUNTIME_LIMITS.STREAM_TIMEOUT_CONFORMITY_BONUS_MS : 0);
  return Math.min(timeout, RUNTIME_LIMITS.STREAM_TIMEOUT_MAX_MS);
}

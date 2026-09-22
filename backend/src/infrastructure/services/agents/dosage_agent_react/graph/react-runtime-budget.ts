import { RUNTIME_LIMITS } from './runtime-limits.constant';
import type { ToolBundle } from './tool-registry';

export interface ReactRuntimeTask {
  readonly status: string;
}

export interface ReactRuntimeBudgetInput {
  readonly toolBundle?: ToolBundle;
  readonly taskList?: ReadonlyArray<ReactRuntimeTask>;
  readonly toolNames?: ReadonlyArray<string>;
  readonly hasConformity?: boolean;
}

export interface ReactRuntimeBudget {
  readonly maxToolCalls: number;
  readonly recursionLimit: number;
  readonly warningThreshold: number;
  readonly criticalThreshold: number;
  readonly patternWindow: number;
  readonly repeatedToolWindow: number;
}

const CONFORMITY_TOOLS = new Set([
  'run_conformity_check',
  'confirm_conformity_check',
  'validate_compliance',
]);

export function computeReactRuntimeBudget(input: ReactRuntimeBudgetInput = {}): ReactRuntimeBudget {
  const pendingTasks = (input.taskList ?? []).filter(
    (task) => task.status === 'pending' || task.status === 'in_progress',
  ).length;
  const hasConformity =
    input.hasConformity ??
    (input.toolNames ?? []).some((toolName) => CONFORMITY_TOOLS.has(toolName));
  const dosageBonus = input.toolBundle === 'DOSAGE' ? 4 : 0;
  const taskBonus = Math.min(6, pendingTasks * 2);
  const conformityBonus = hasConformity ? 5 : 0;
  const maxToolCalls = Math.min(
    30,
    RUNTIME_LIMITS.LOOP_CRITICAL_THRESHOLD + dosageBonus + taskBonus + conformityBonus,
  );
  return {
    maxToolCalls,
    recursionLimit: Math.min(120, Math.max(50, 8 + maxToolCalls * 4)),
    warningThreshold: Math.max(
      RUNTIME_LIMITS.LOOP_WARNING_THRESHOLD,
      Math.floor(maxToolCalls * 0.6),
    ),
    criticalThreshold: maxToolCalls,
    patternWindow: RUNTIME_LIMITS.LOOP_PATTERN_WINDOW,
    repeatedToolWindow: RUNTIME_LIMITS.LOOP_REPEATED_IDENTICAL_TOOL_WINDOW,
  };
}

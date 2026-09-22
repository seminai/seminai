import { END } from '@langchain/langgraph';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { DosageReactState } from '../type/state';
import { LoopDetector } from '../loop-detector';
import type { LoopStatus } from '../loop-detector';
import { CRITIC_TARGET_TOOLS } from './auto-critic-node';
import { classifyRisk, shouldAutoApprove } from './risk-classifier';
import { computeReactRuntimeBudget } from './react-runtime-budget';
import { normalizeToolCallHistory } from './tool-call-record';
import type { ToolBundle } from './tool-registry';

export interface GuardRoutingOptions {
  readonly toolBundle?: ToolBundle;
  readonly toolNames?: ReadonlyArray<string>;
}

/**
 * Routes after the agent node.
 * If the agent wants to call a tool → 'guard'
 * Otherwise → END
 */
export function routeAfterAgent(state: DosageReactState): 'guard' | typeof END {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage & {
    tool_calls?: Array<{ name: string; args: Record<string, unknown>; id: string }>;
  };

  if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
    return 'guard';
  }

  return END;
}

/**
 * Creates a routing function after the guard node.
 * Captures a shared LoopDetector instance via closure.
 *
 * - 'execute' → proceed to tool execution
 * - 'approval_gate' → pause for user approval (interruptBefore)
 * - END → abort (loop detected at critical level)
 */
export function createRouteAfterGuard(
  loopDetector: LoopDetector,
  options: GuardRoutingOptions = {},
) {
  return function routeAfterGuard(
    state: DosageReactState,
  ): 'execute' | 'approval_gate' | typeof END {
    // 1. Loop detection
    const history =
      state.lastToolCallRecords && state.lastToolCallRecords.length > 0
        ? state.lastToolCallRecords
        : normalizeToolCallHistory(state.lastToolCalls);
    const runtimeBudget = computeReactRuntimeBudget({
      toolBundle: options.toolBundle,
      taskList: state.taskList,
      toolNames: options.toolNames,
    });
    const loopStatus: LoopStatus = loopDetector.detect(history, runtimeBudget);
    if (loopStatus === 'critical' || loopStatus === 'pattern') {
      return END;
    }

    // 1b. Hard-stop: once present_extraction_review has been called, no further
    // tool calls are allowed in the same turn. The form is rendered to the user
    // and the chat must wait for Save/Cancel via REST. This prevents the agent
    // from looping on the tool or accidentally invoking import_*_from_file.
    const previousTool = state.lastToolCalls[state.lastToolCalls.length - 2];
    if (previousTool === 'present_extraction_review') {
      return END;
    }

    // 2. Check if pending tool requires approval
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage & {
      tool_calls?: Array<{ name: string; args: Record<string, unknown>; id: string }>;
    };

    if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
      const needsApproval = lastMessage.tool_calls.some((tc) => {
        const classification = classifyRisk(tc.name, tc.args as Record<string, unknown>);
        return !shouldAutoApprove(classification);
      });
      if (needsApproval) {
        return 'approval_gate';
      }
    }

    // 3. Proceed to tool execution
    return 'execute';
  };
}

/**
 * Routes after the tools node.
 * If the last tool was a compute-heavy tool → 'autoCritic' for sanity check.
 * Otherwise → 'contextCompressor' (which passes through to agent if no compression needed).
 */
export function routeAfterTools(state: DosageReactState): 'autoCritic' | 'contextCompressor' {
  const lastMessage = state.messages[state.messages.length - 1];

  if (lastMessage instanceof ToolMessage && lastMessage.name) {
    if (CRITIC_TARGET_TOOLS.has(lastMessage.name)) {
      return 'autoCritic';
    }
  }

  return 'contextCompressor';
}

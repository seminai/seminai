/**
 * Loop detector for the ReAct agent.
 * Prevents infinite loops by detecting repetitive tool call patterns.
 */

import { RUNTIME_LIMITS } from './graph/runtime-limits.constant';
import {
  getToolCallFingerprint,
  normalizeToolCallHistory,
  type ToolCallRecord,
} from './graph/tool-call-record';

export interface LoopDetectorConfig {
  /** Emit warning after this many total tool calls */
  warningThreshold: number;
  /** Abort agent after this many total tool calls */
  criticalThreshold: number;
  /** Number of recent tool calls to check for repeating patterns */
  patternWindow: number;
  /** Number of identical recent tool calls that should stop immediately */
  repeatedToolWindow: number;
}

export type LoopStatus = 'ok' | 'warning' | 'critical' | 'pattern';

const DEFAULT_CONFIG: LoopDetectorConfig = {
  warningThreshold: RUNTIME_LIMITS.LOOP_WARNING_THRESHOLD,
  criticalThreshold: RUNTIME_LIMITS.LOOP_CRITICAL_THRESHOLD,
  patternWindow: RUNTIME_LIMITS.LOOP_PATTERN_WINDOW,
  repeatedToolWindow: RUNTIME_LIMITS.LOOP_REPEATED_IDENTICAL_TOOL_WINDOW,
};

export class LoopDetector {
  private readonly config: LoopDetectorConfig;

  constructor(config?: Partial<LoopDetectorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Detects if the agent is stuck in a loop.
   *
   * @param toolHistory Array of recent tool call names
   * @returns Status: 'ok' | 'warning' | 'critical' | 'pattern'
   */
  detect(
    toolHistory: ReadonlyArray<string | ToolCallRecord>,
    config?: Partial<LoopDetectorConfig>,
  ): LoopStatus {
    const effectiveConfig = { ...this.config, ...config };
    const records = normalizeToolCallHistory(toolHistory);
    const fingerprints = records.map(getToolCallFingerprint);
    const count = records.length;

    // Critical threshold — abort
    if (count >= effectiveConfig.criticalThreshold) {
      return 'critical';
    }

    // Stop identical tool+args loops before LangGraph recursion limit can be exhausted.
    if (count >= effectiveConfig.repeatedToolWindow) {
      const repeated = fingerprints.slice(-effectiveConfig.repeatedToolWindow);
      if (repeated.every((fingerprint) => fingerprint === repeated[0])) {
        return 'pattern';
      }
    }

    // Check for repeating patterns in the last N calls
    if (count >= effectiveConfig.patternWindow) {
      const recent = fingerprints.slice(-effectiveConfig.patternWindow);
      if (this.hasRepeatingPattern(recent)) {
        return 'pattern';
      }
    }

    // Warning threshold — inject warning into conversation
    if (count >= effectiveConfig.warningThreshold) {
      return 'warning';
    }

    return 'ok';
  }

  /**
   * Detects repeating patterns like [A, B, A, B, A, B] or [A, A, A, A].
   */
  private hasRepeatingPattern(recent: string[]): boolean {
    // Check for same tool called repeatedly
    if (recent.every((t) => t === recent[0])) {
      return true;
    }

    // Check for alternating pattern (period 2): A, B, A, B
    if (recent.length >= 4) {
      const period2 = recent.every((t, i) => t === recent[i % 2]);
      if (period2) return true;
    }

    // Check for period-3 pattern: A, B, C, A, B, C
    if (recent.length >= 6) {
      const period3 = recent.every((t, i) => t === recent[i % 3]);
      if (period3) return true;
    }

    return false;
  }
}

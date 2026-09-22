export const FIELD_NOTE_RUNTIME_LIMITS = {
  RECURSION_LIMIT: 50,
  LOOP_WARNING_THRESHOLD: 8,
  LOOP_CRITICAL_THRESHOLD: 15,
  LOOP_PATTERN_WINDOW: 6,
  LOOP_REPEATED_TOOL_WINDOW: 5,
} as const;

export type FieldNoteRunConfig = {
  configurable: { thread_id: string };
  recursionLimit: number;
};

export type FieldNoteLoopStatus = 'ok' | 'warning' | 'critical' | 'pattern';

export function createFieldNoteRunConfig(threadId: string): FieldNoteRunConfig {
  return {
    configurable: { thread_id: threadId },
    recursionLimit: FIELD_NOTE_RUNTIME_LIMITS.RECURSION_LIMIT,
  };
}

export function detectFieldNoteToolLoop(toolHistory: readonly string[]): FieldNoteLoopStatus {
  const count = toolHistory.length;

  if (count >= FIELD_NOTE_RUNTIME_LIMITS.LOOP_CRITICAL_THRESHOLD) {
    return 'critical';
  }

  if (count >= FIELD_NOTE_RUNTIME_LIMITS.LOOP_REPEATED_TOOL_WINDOW) {
    const repeated = toolHistory.slice(-FIELD_NOTE_RUNTIME_LIMITS.LOOP_REPEATED_TOOL_WINDOW);
    if (repeated.every((toolName) => toolName === repeated[0])) {
      return 'pattern';
    }
  }

  if (count >= FIELD_NOTE_RUNTIME_LIMITS.LOOP_PATTERN_WINDOW) {
    const recent = toolHistory.slice(-FIELD_NOTE_RUNTIME_LIMITS.LOOP_PATTERN_WINDOW);
    if (hasRepeatingPattern(recent)) {
      return 'pattern';
    }
  }

  if (count >= FIELD_NOTE_RUNTIME_LIMITS.LOOP_WARNING_THRESHOLD) {
    return 'warning';
  }

  return 'ok';
}

function hasRepeatingPattern(recent: readonly string[]): boolean {
  if (recent.every((toolName) => toolName === recent[0])) {
    return true;
  }

  if (recent.length >= 4 && recent.every((toolName, index) => toolName === recent[index % 2])) {
    return true;
  }

  if (recent.length >= 6 && recent.every((toolName, index) => toolName === recent[index % 3])) {
    return true;
  }

  return false;
}

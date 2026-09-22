import { RUNTIME_LIMITS } from '../graph/runtime-limits.constant';
import { computeReactRuntimeBudget } from '../graph/react-runtime-budget';
import type { ToolCallRecord } from '../graph/tool-call-record';
import { LoopDetector } from '../loop-detector';

describe('RUNTIME_LIMITS', () => {
  it('warning threshold is less than critical threshold', () => {
    expect(RUNTIME_LIMITS.LOOP_WARNING_THRESHOLD).toBeLessThan(
      RUNTIME_LIMITS.LOOP_CRITICAL_THRESHOLD,
    );
  });

  it('pattern window is less than or equal to warning threshold', () => {
    expect(RUNTIME_LIMITS.LOOP_PATTERN_WINDOW).toBeLessThanOrEqual(
      RUNTIME_LIMITS.LOOP_WARNING_THRESHOLD,
    );
    expect(RUNTIME_LIMITS.LOOP_REPEATED_TOOL_WINDOW).toBeLessThanOrEqual(
      RUNTIME_LIMITS.LOOP_WARNING_THRESHOLD,
    );
  });

  it('recursion limit is greater than critical threshold', () => {
    expect(RUNTIME_LIMITS.RECURSION_LIMIT).toBeGreaterThan(RUNTIME_LIMITS.LOOP_CRITICAL_THRESHOLD);
  });

  it('stream timeout is positive', () => {
    expect(RUNTIME_LIMITS.STREAM_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('max tokens per message is positive', () => {
    expect(RUNTIME_LIMITS.MAX_TOKENS_PER_MESSAGE).toBeGreaterThan(0);
  });

  it('all values are numbers', () => {
    for (const value of Object.values(RUNTIME_LIMITS)) {
      expect(typeof value).toBe('number');
    }
  });

  it('detects three identical tool calls before LangGraph recursion can fail', () => {
    const detector = new LoopDetector();
    const records = Array(3).fill({
      name: 'search_products',
      argsHash: 'same',
      argsPreview: '{}',
    }) as ToolCallRecord[];
    expect(detector.detect(records)).toBe('pattern');
  });

  it('does not stop same tool calls when arguments differ', () => {
    const detector = new LoopDetector();
    const records = Array.from({ length: 5 }, (_, index) => ({
      name: 'search_products',
      argsHash: `args-${index}`,
      argsPreview: '{}',
    }));
    expect(detector.detect(records)).toBe('ok');
  });

  it('detects alternating patterns on tool argument fingerprints', () => {
    const detector = new LoopDetector();
    const records = ['a', 'b', 'a', 'b', 'a', 'b'].map((argsHash) => ({
      name: 'search_products',
      argsHash,
      argsPreview: '{}',
    }));
    expect(detector.detect(records)).toBe('pattern');
  });

  it('uses adaptive budget for critical threshold', () => {
    const detector = new LoopDetector();
    const budget = computeReactRuntimeBudget({
      toolBundle: 'DOSAGE',
      taskList: [{ status: 'pending' }, { status: 'in_progress' }],
    });
    const belowBudget = Array.from({ length: budget.maxToolCalls - 1 }, (_, index) => ({
      name: `tool_${index}`,
      argsHash: `args-${index}`,
      argsPreview: '{}',
    }));
    const atBudget = [
      ...belowBudget,
      { name: 'final_tool', argsHash: 'final-args', argsPreview: '{}' },
    ];
    expect(detector.detect(belowBudget, budget)).not.toBe('critical');
    expect(detector.detect(atBudget, budget)).toBe('critical');
  });
});

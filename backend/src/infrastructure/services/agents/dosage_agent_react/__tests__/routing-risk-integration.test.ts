import { END } from '@langchain/langgraph';
import { AIMessage } from '@langchain/core/messages';
import { createRouteAfterGuard } from '../graph/routing';
import { LoopDetector } from '../loop-detector';
import type { DosageReactState } from '../type/state';

function makeState(
  toolCalls: Array<{ name: string; args: Record<string, unknown>; id: string }>,
  lastToolCalls: string[] = [],
): DosageReactState {
  const aiMessage = new AIMessage({ content: '' });
  (aiMessage as AIMessage & { tool_calls: typeof toolCalls }).tool_calls = toolCalls;
  return {
    messages: [aiMessage],
    loopCounter: lastToolCalls.length,
    lastToolCalls,
    taskList: [],
  };
}

describe('routeAfterGuard with classifyRisk', () => {
  const loopDetector = new LoopDetector();
  const routeAfterGuard = createRouteAfterGuard(loopDetector);

  it('auto-approves low-risk tool (search_products, score 5)', () => {
    const state = makeState([{ name: 'search_products', args: {}, id: 'tc1' }]);
    expect(routeAfterGuard(state)).toBe('execute');
  });

  it('requires approval for workspace rule writes', () => {
    const state = makeState([{ name: 'create_workspace_rule', args: {}, id: 'tc2' }]);
    expect(routeAfterGuard(state)).toBe('approval_gate');
  });

  it('requires approval for unknown tools by default', () => {
    const state = makeState([{ name: 'new_unclassified_tool', args: {}, id: 'tc-unknown' }]);
    expect(routeAfterGuard(state)).toBe('approval_gate');
  });

  it('requires approval for medium-risk tool (create_fields, score 35)', () => {
    const state = makeState([{ name: 'create_fields', args: {}, id: 'tc3' }]);
    expect(routeAfterGuard(state)).toBe('approval_gate');
  });

  it('requires approval for medium-risk tool (import_from_file, score 40)', () => {
    const state = makeState([{ name: 'import_from_file', args: {}, id: 'tc4' }]);
    expect(routeAfterGuard(state)).toBe('approval_gate');
  });

  it('requires approval for production-unit updates', () => {
    const state = makeState([{ name: 'update_production_units', args: {}, id: 'tc-update' }]);
    expect(routeAfterGuard(state)).toBe('approval_gate');
  });

  it('requires approval for high-risk tool (import_from_file + overwrite)', () => {
    const state = makeState([{ name: 'import_from_file', args: { overwrite: true }, id: 'tc5' }]);
    expect(routeAfterGuard(state)).toBe('approval_gate');
  });

  it('aborts on critical loop (>= 15 calls)', () => {
    const history = Array(15).fill('search_products');
    const state = makeState([{ name: 'search_products', args: {}, id: 'tc6' }], history);
    expect(routeAfterGuard(state)).toBe(END);
  });

  it('aborts on pattern detection (same tool repeated)', () => {
    const history = [
      'search_products',
      'search_products',
      'search_products',
      'search_products',
      'search_products',
      'search_products',
    ];
    const state = makeState([{ name: 'search_products', args: {}, id: 'tc7' }], history);
    expect(routeAfterGuard(state)).toBe(END);
  });

  it('loop detection takes priority over risk classification', () => {
    const history = Array(15).fill('create_fields');
    const state = makeState([{ name: 'create_fields', args: {}, id: 'tc8' }], history);
    // Even though create_fields needs approval, critical loop ends execution
    expect(routeAfterGuard(state)).toBe(END);
  });
});

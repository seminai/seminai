import { LoopDetector } from '../infrastructure/services/agents/dosage_agent_react/loop-detector';
import { createRouteAfterGuard } from '../infrastructure/services/agents/dosage_agent_react/graph/routing';
import { AIMessage } from '@langchain/core/messages';
import type { DosageReactState } from '../infrastructure/services/agents/dosage_agent_react/type/state';

jest.setTimeout(180000); // 3 minutes for LLM tests

const routeAfterGuard = createRouteAfterGuard(new LoopDetector());
// ---------------------------------------------------------------------------
// SECTION 1 — Foundation (no LLM, no DB)
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Foundation', () => {

  describe('Routing Functions', () => {

    it('routeAfterGuard should route to END on critical loop', () => {
      const state: DosageReactState = {
        messages: [
          new AIMessage({
            content: '',
            tool_calls: [{ name: 'search_products', args: {}, id: 'tc1', type: 'tool_call' }],
          }),
        ],
        loopCounter: 15,
        lastToolCalls: Array(15)
          .fill(null)
          .map((_, i) => `tool_${i}`),
        taskList: [],
      };

      expect(routeAfterGuard(state)).toBe('__end__');
    });});});

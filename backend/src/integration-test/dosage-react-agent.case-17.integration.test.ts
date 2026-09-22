import { routeAfterAgent } from '../infrastructure/services/agents/dosage_agent_react/graph/routing';
import { AIMessage } from '@langchain/core/messages';
import type { DosageReactState } from '../infrastructure/services/agents/dosage_agent_react/type/state';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 1 — Foundation (no LLM, no DB)
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Foundation', () => {

  describe('Routing Functions', () => {

    it('routeAfterAgent should route to END when no tool calls', () => {
      const state: DosageReactState = {
        messages: [new AIMessage({ content: 'Ecco la risposta.' })],
        loopCounter: 0,
        lastToolCalls: [],
        taskList: [],
      };

      expect(routeAfterAgent(state)).toBe('__end__');
    });});});

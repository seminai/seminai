import { routeAfterAgent } from '../infrastructure/services/agents/dosage_agent_react/graph/routing';
import { AIMessage } from '@langchain/core/messages';
import type { DosageReactState } from '../infrastructure/services/agents/dosage_agent_react/type/state';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 1 — Foundation (no LLM, no DB)
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Foundation', () => {

  describe('Routing Functions', () => {
    it('routeAfterAgent should route to "guard" when tool calls present', () => {
      const state: DosageReactState = {
        messages: [
          new AIMessage({
            content: 'Checking product...',
            tool_calls: [
              {
                name: 'check_product_revoked',
                args: { registrationNumber: '123' },
                id: 'tc1',
                type: 'tool_call',
              },
            ],
          }),
        ],
        loopCounter: 0,
        lastToolCalls: [],
        taskList: [],
      };

      expect(routeAfterAgent(state)).toBe('guard');
    });});});

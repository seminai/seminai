import { extractSourcesFromMessages } from '../infrastructure/services/agents/dosage_agent_react/DosageReactAgent';
import { AIMessage, HumanMessage } from '@langchain/core/messages';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 1 — Foundation (no LLM, no DB)
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Foundation', () => {

  describe('Source Extraction', () => {

    it('should return empty array when no Tavily messages', () => {
      const messages = [
        new HumanMessage('Ciao'),
        new AIMessage({ content: 'Come posso aiutarti?' }),
      ];

      expect(extractSourcesFromMessages(messages)).toHaveLength(0);
    });});});

import { extractSourcesFromMessages } from '../infrastructure/services/agents/dosage_agent_react/DosageReactAgent';
import { HumanMessage, ToolMessage } from '@langchain/core/messages';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 1 — Foundation (no LLM, no DB)
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Foundation', () => {

  describe('Source Extraction', () => {
    it('should extract sources from Tavily ToolMessages', () => {
      const messages = [
        new HumanMessage('Cerca info'),
        new ToolMessage({
          content: `[SOURCE_1] Title: Article on pesticides URL: https://example.com/article Content: Some content Fragment: Key fragment about doses\n---`,
          name: 'tavily_scientific_search',
          tool_call_id: 'tc1',
        }),
      ];

      const sources = extractSourcesFromMessages(messages);
      expect(sources.length).toBeGreaterThanOrEqual(1);
      expect(sources[0].url).toBe('https://example.com/article');
    });});});

import { LoopDetector } from '../infrastructure/services/agents/dosage_agent_react/loop-detector';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 1 — Foundation (no LLM, no DB)
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Foundation', () => {

  describe('Loop Detector', () => {

    it('should detect same-tool repetition pattern', () => {
      const detector = new LoopDetector();
      const history = [
        'search_products',
        'search_products',
        'search_products',
        'search_products',
        'search_products',
        'search_products',
      ];
      expect(detector.detect(history)).toBe('pattern');
    });});});

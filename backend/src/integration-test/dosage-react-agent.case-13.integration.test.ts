import { LoopDetector } from '../infrastructure/services/agents/dosage_agent_react/loop-detector';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 1 — Foundation (no LLM, no DB)
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Foundation', () => {

  describe('Loop Detector', () => {

    it('should detect period-3 pattern (A, B, C, A, B, C)', () => {
      const detector = new LoopDetector();
      const history = ['a', 'b', 'c', 'a', 'b', 'c'];
      expect(detector.detect(history)).toBe('pattern');
    });});});

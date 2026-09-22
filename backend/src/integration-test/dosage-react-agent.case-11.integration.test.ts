import { LoopDetector } from '../infrastructure/services/agents/dosage_agent_react/loop-detector';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 1 — Foundation (no LLM, no DB)
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Foundation', () => {

  describe('Loop Detector', () => {

    it('should detect alternating pattern (A, B, A, B, A, B)', () => {
      const detector = new LoopDetector();
      const history = ['a', 'b', 'a', 'b', 'a', 'b'];
      expect(detector.detect(history)).toBe('pattern');
    });});});

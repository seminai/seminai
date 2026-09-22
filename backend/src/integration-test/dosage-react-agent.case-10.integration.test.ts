import { LoopDetector } from '../infrastructure/services/agents/dosage_agent_react/loop-detector';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 1 — Foundation (no LLM, no DB)
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Foundation', () => {

  describe('Loop Detector', () => {

    it('should return "critical" at 15 calls', () => {
      const detector = new LoopDetector();
      const history = Array(15)
        .fill(null)
        .map((_, i) => `tool_${i}`);
      expect(detector.detect(history)).toBe('critical');
    });});});

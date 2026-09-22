import { LoopDetector } from '../infrastructure/services/agents/dosage_agent_react/loop-detector';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 1 — Foundation (no LLM, no DB)
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Foundation', () => {

  describe('Loop Detector', () => {

    it('should respect custom thresholds', () => {
      const detector = new LoopDetector({ warningThreshold: 3, criticalThreshold: 5 });
      expect(detector.detect(['a', 'b', 'c'])).toBe('warning');
      expect(detector.detect(['a', 'b', 'c', 'd', 'e'])).toBe('critical');
    });});});

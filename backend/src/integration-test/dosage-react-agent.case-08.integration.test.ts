import { LoopDetector } from '../infrastructure/services/agents/dosage_agent_react/loop-detector';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 1 — Foundation (no LLM, no DB)
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Foundation', () => {

  describe('Loop Detector', () => {
    it('should return "ok" for few tool calls', () => {
      const detector = new LoopDetector();
      expect(detector.detect(['search_products', 'calculate_dosage'])).toBe('ok');
    });});});

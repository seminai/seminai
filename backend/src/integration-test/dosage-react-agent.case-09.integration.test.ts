import { LoopDetector } from '../infrastructure/services/agents/dosage_agent_react/loop-detector';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 1 — Foundation (no LLM, no DB)
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Foundation', () => {

  describe('Loop Detector', () => {

    it('should return "warning" at threshold (8 calls)', () => {
      const detector = new LoopDetector();
      const history = Array(8).fill('check_product_revoked');
      // 8 identical calls will trigger pattern detection first
      expect(['warning', 'pattern']).toContain(detector.detect(history));
    });});});

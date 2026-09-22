import { LoopDetector } from '../infrastructure/services/agents/dosage_agent_react/loop-detector';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 1 — Foundation (no LLM, no DB)
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Foundation', () => {

  describe('Loop Detector', () => {

    it('should return "ok" for diverse tool sequence', () => {
      const detector = new LoopDetector();
      const history = [
        'search_products',
        'calculate_dosage',
        'validate_compliance',
        'check_compatibility',
      ];
      expect(detector.detect(history)).toBe('ok');
    });});});

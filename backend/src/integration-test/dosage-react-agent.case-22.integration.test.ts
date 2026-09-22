import { DESTRUCTIVE_TOOLS } from '../infrastructure/services/agents/dosage_agent_react/tools/create-jobs.tool';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 1 — Foundation (no LLM, no DB)
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Foundation', () => {

  describe('DESTRUCTIVE_TOOLS Set', () => {

    it('should NOT contain computation tools', () => {
      expect(DESTRUCTIVE_TOOLS.has('search_products')).toBe(false);
      expect(DESTRUCTIVE_TOOLS.has('calculate_dosage')).toBe(false);
      expect(DESTRUCTIVE_TOOLS.has('check_product_revoked')).toBe(false);
    });});});

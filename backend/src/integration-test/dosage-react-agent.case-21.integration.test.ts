import { DESTRUCTIVE_TOOLS } from '../infrastructure/services/agents/dosage_agent_react/tools/create-jobs.tool';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 1 — Foundation (no LLM, no DB)
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Foundation', () => {

  describe('DESTRUCTIVE_TOOLS Set', () => {
    it('should contain create_treatment_jobs', () => {
      expect(DESTRUCTIVE_TOOLS.has('create_treatment_jobs')).toBe(true);
    });});});

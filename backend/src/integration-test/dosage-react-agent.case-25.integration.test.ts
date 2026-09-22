import { createCheckRevokedTool } from '../infrastructure/services/agents/dosage_agent_react/tools/check-revoked.tool';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 2 — Tool Direct Invocation
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Tool Invocation', () => {
  describe('check_product_revoked tool', () => {
    it('should be created with correct name and schema', () => {
      const tool = createCheckRevokedTool();
      expect(tool.name).toBe('check_product_revoked');
      expect(tool.description).toContain('revocati');
    });});});

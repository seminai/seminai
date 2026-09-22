import { createCheckRevokedTool } from '../infrastructure/services/agents/dosage_agent_react/tools/check-revoked.tool';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 2 — Tool Direct Invocation
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Tool Invocation', () => {
  describe('check_product_revoked tool', () => {

    it('should handle missing parameters gracefully', async () => {
      const tool = createCheckRevokedTool();
      const result = await tool.invoke({});
      const parsed = JSON.parse(result);
      // Should not throw — returns some valid JSON response
      expect(parsed).toBeDefined();
    });});});

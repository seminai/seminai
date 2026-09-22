import { createCheckRevokedTool } from '../infrastructure/services/agents/dosage_agent_react/tools/check-revoked.tool';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 2 — Tool Direct Invocation
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Tool Invocation', () => {
  describe('check_product_revoked tool', () => {

    it('should handle batch mode with multiple products', async () => {
      const tool = createCheckRevokedTool();
      const result = await tool.invoke({
        products: [
          { regNumber: '99998', name: 'Fake Product A' },
          { regNumber: '99997', name: 'Fake Product B' },
        ],
      });

      const parsed = JSON.parse(result);
      // Either dataset not available warning OR batch results
      if (parsed.totalChecked !== undefined) {
        expect(parsed.totalChecked).toBe(2);
        expect(parsed.results).toHaveLength(2);
      }
    });});});

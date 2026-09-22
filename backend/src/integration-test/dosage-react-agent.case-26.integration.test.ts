import { createCheckRevokedTool } from '../infrastructure/services/agents/dosage_agent_react/tools/check-revoked.tool';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 2 — Tool Direct Invocation
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Tool Invocation', () => {
  describe('check_product_revoked tool', () => {

    it('should return ATTIVO for a valid non-revoked product', async () => {
      const tool = createCheckRevokedTool();
      const result = await tool.invoke({
        registrationNumber: '99999',
        productName: 'Prodotto Inventato Test',
      });

      const parsed = JSON.parse(result);
      // A non-existent product should return ATTIVO (not in revoked dataset)
      // OR a warning if dataset not available
      expect(['ATTIVO', undefined]).toContain(parsed.status);
      if (parsed.status === 'ATTIVO') {
        expect(parsed.message).toContain('attivo');
      }
    });});});

import {
  createTestUser,
  createTestCompany,
  deleteAllTestCompanies,
  deleteTestUser,
  prisma,
} from './helpers';
import {
  getWorkingMemory,
  updateWorkingMemory,
} from '../infrastructure/services/agents/dosage_agent_react/working-memory';
import { autoPresentExtractionReview } from '../infrastructure/queue/auto-present-extraction-review';
import {
  deletePendingExtraction,
  getPendingExtraction,
} from '../infrastructure/persistence/pending-extraction-store';
import type { StockPreviewEntry } from '../infrastructure/services/agents/dosage_agent_react/tools/file-extraction-types';

/**
 * Integration test for the @mention isolation fix in streaming.ts.
 *
 * Bug (before fix): the streaming layer would only overwrite WM.currentMentions
 * when the new turn had mentions. Stale mentions from a previous turn would
 * survive and the auto-present flow could associate a chat-uploaded document
 * with the wrong company for users with multiple companies.
 *
 * Fix: streaming.ts now always overwrites WM.currentMentions for every turn
 * (including with an empty array). This test verifies the end-state through
 * the real auto-present pipeline (real Postgres + real Redis), exercising
 * both the buggy pre-fix simulation and the post-fix simulation.
 */
jest.setTimeout(60_000);

const fakeStockEntries: readonly StockPreviewEntry[] = [
  {
    name: 'AIRONE',
    category: 'OTHER',
    registrationNumber: '12345',
    stock: {
      quantity: 10,
      unitOfMeasureQuantity: 'KG',
      price: 100,
      type: 'IN',
      ddtCode: 'DDT-001',
      ddtDate: '2026-01-15',
      invoiceCode: 'FT-001',
      companySupplierName: 'Fornitore SRL',
    },
  },
];

describe('Auto-present extraction — @mention isolation across turns', () => {
  let userId: string;
  let companyAId: string;
  let companyBId: string;
  const threadId = `test-thread-${Date.now()}`;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const a = await createTestCompany({ userId, name: 'Company A', vatNumber: '11111111111' });
    const b = await createTestCompany({ userId, name: 'Company B', vatNumber: '22222222222' });
    companyAId = a.id;
    companyBId = b.id;
  });

  afterAll(async () => {
    await deleteAllTestCompanies(userId);
    await deleteTestUser();
    await prisma.$disconnect();
  });

  afterEach(() => {
    // Reset WM between scenarios so each test exercises a clean state.
    updateWorkingMemory(threadId, { currentMentions: [] });
  });

  describe('Pre-fix behavior (regression guard)', () => {
    it('demonstrates the bug: when WM keeps stale mentions, auto-present uses the wrong company', async () => {
      // Turn 1: user mentions @Company A.
      updateWorkingMemory(threadId, {
        currentMentions: [{ type: 'company', id: companyAId, label: 'Company A' }],
      });

      // Turn 2 (pre-fix): user uploads a PDF without any @mention.
      // The buggy streaming.ts skipped the WM update because mentions.length === 0,
      // leaving the stale Company A mention.
      // We DO NOT call updateWorkingMemory here to simulate the buggy behavior.

      const wm = getWorkingMemory(threadId);
      expect(wm.currentMentions).toEqual([{ type: 'company', id: companyAId, label: 'Company A' }]);

      // The PDF worker reads mentions from WM at job submission time.
      const mentionsAtJobTime = wm.currentMentions ?? [];

      const result = await autoPresentExtractionReview({
        threadId,
        userId,
        fileName: 'doc.pdf',
        documentCategory: 'DDT',
        stockEntries: fakeStockEntries,
        mentions: mentionsAtJobTime,
      });

      // The bug: document gets auto-presented and associated with Company A
      // even though the user did NOT mention it in the current turn.
      expect(result.presented).toBe(true);
      expect(result.companyId).toBe(companyAId);

      // Cleanup the pending Redis entry created by this scenario.
      if (result.reviewId) await deletePendingExtraction(result.reviewId);
    });
  });

  describe('Post-fix behavior', () => {
    it('with the streaming.ts fix, a turn without mentions resets WM and auto-present asks (needsQuestion)', async () => {
      // Turn 1: user mentions @Company A.
      updateWorkingMemory(threadId, {
        currentMentions: [{ type: 'company', id: companyAId, label: 'Company A' }],
      });

      // Turn 2: user uploads a PDF without @mention.
      // The fixed streaming.ts ALWAYS overwrites currentMentions, including with [].
      updateWorkingMemory(threadId, { currentMentions: [] });

      const wm = getWorkingMemory(threadId);
      expect(wm.currentMentions).toEqual([]);

      const mentionsAtJobTime = wm.currentMentions ?? [];

      const result = await autoPresentExtractionReview({
        threadId,
        userId,
        fileName: 'doc.pdf',
        documentCategory: 'DDT',
        stockEntries: fakeStockEntries,
        mentions: mentionsAtJobTime,
      });

      // With 2 companies and no mention, the resolver yields 'needsQuestion'
      // and auto-present should bail out so the agent asks the user.
      expect(result.presented).toBe(false);
      expect(result.reason).toContain('needsQuestion');
    });

    it('a fresh turn with @Company B correctly auto-presents on B (no leakage from earlier @A)', async () => {
      // Turn 1: user mentions @Company A (stale).
      updateWorkingMemory(threadId, {
        currentMentions: [{ type: 'company', id: companyAId, label: 'Company A' }],
      });

      // Turn 2: user mentions @Company B and uploads a PDF.
      // The fix overwrites currentMentions cleanly — no merge with stale A.
      updateWorkingMemory(threadId, {
        currentMentions: [{ type: 'company', id: companyBId, label: 'Company B' }],
      });

      const wm = getWorkingMemory(threadId);
      const mentionsAtJobTime = wm.currentMentions ?? [];

      const result = await autoPresentExtractionReview({
        threadId,
        userId,
        fileName: 'doc.pdf',
        documentCategory: 'DDT',
        stockEntries: fakeStockEntries,
        mentions: mentionsAtJobTime,
      });

      expect(result.presented).toBe(true);
      expect(result.companyId).toBe(companyBId);

      // Verify the pending record was actually saved in Redis with the right company.
      if (result.reviewId) {
        const pending = await getPendingExtraction(result.reviewId);
        expect(pending).not.toBeNull();
        expect(pending?.companyId).toBe(companyBId);
        await deletePendingExtraction(result.reviewId);
      }
    });
  });
});

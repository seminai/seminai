import { createTestUser, deleteTestUser, prisma } from './helpers';
import { DisciplinariPdfVectorStore, BDF_DISCIPLINARI_CATALOG } from '../infrastructure/services/agents/chat_dosage_agent/rag/DisciplinariPdfVectorStore';

jest.setTimeout(180000);
// ===========================================================================
// TEST SUITE
// ===========================================================================

describe('Chat Dosage Agent — Nuove Funzionalità (Modifications + BDF PDF + Batch Mode)', () => {
  let testUser: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    testUser = await createTestUser();
  });

  afterAll(async () => {
    await prisma.messageSource.deleteMany({});
    await prisma.sourceCitation.deleteMany({});
    await prisma.message.deleteMany({});
    await prisma.chat.deleteMany({ where: { userId: testUser.id } });
    await deleteTestUser();
  });

  // =========================================================================
  // FEATURE 2 — DisciplinariPdfVectorStore (lazy loading + catalog)
  // =========================================================================

  describe('FEATURE 2 — DisciplinariPdfVectorStore', () => {

    it('dovrebbe filtrare per anno 2025', () => {
      const store = new DisciplinariPdfVectorStore(BDF_DISCIPLINARI_CATALOG);
      const available = store.listAvailable(undefined, 2025);
      expect(available.length).toBeGreaterThan(0);
      expect(available.every((e) => e.anno === 2025)).toBe(true);
    });});});

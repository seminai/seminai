import { createTestUser, deleteTestUser, prisma } from './helpers';
import { BDF_DISCIPLINARI_CATALOG } from '../infrastructure/services/agents/chat_dosage_agent/rag/DisciplinariPdfVectorStore';

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

    it('dovrebbe avere voci per tutte le regioni principali', () => {
      const regions = BDF_DISCIPLINARI_CATALOG.map((e) => e.title.toLowerCase());
      expect(regions.some((r) => r.includes('emilia-romagna'))).toBe(true);
      expect(regions.some((r) => r.includes('piemonte'))).toBe(true);
      expect(regions.some((r) => r.includes('veneto'))).toBe(true);
      expect(regions.some((r) => r.includes('lombardia'))).toBe(true);
      expect(regions.some((r) => r.includes('toscana'))).toBe(true);
    });});});

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

    it('dovrebbe avere voci per gli anni 2024 e 2025', () => {
      const years = BDF_DISCIPLINARI_CATALOG.map((e) => e.anno);
      expect(years).toContain(2024);
      expect(years).toContain(2025);
    });});});

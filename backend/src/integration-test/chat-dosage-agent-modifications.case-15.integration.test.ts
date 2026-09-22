import { createTestUser, deleteTestUser, prisma } from './helpers';
import { DisciplinariPdfVectorStore, BDF_DISCIPLINARI_CATALOG } from '../infrastructure/services/agents/chat_dosage_agent/rag/DisciplinariPdfVectorStore';
import { createDisciplinariPdfSearchTool } from '../infrastructure/services/agents/chat_dosage_agent/tools-disciplinari-bdf';

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
  // FEATURE 2 — search_disciplinari_bdf_pdf tool (senza LLM)
  // =========================================================================

  describe('FEATURE 2 — search_disciplinari_bdf_pdf tool (listing + error paths)', () => {

    it('dovrebbe restituire messaggio di errore se regione non trovata', async () => {
      const store = new DisciplinariPdfVectorStore(BDF_DISCIPLINARI_CATALOG);
      const tool = createDisciplinariPdfSearchTool(store);

      const result = await tool.invoke({
        query: 'captano ticchiolatura melo',
        region: 'RegioneFantasia',
        year: 2025,
        limit: 5,
      });

      expect(result).toContain('No disciplinari found');
    });});});

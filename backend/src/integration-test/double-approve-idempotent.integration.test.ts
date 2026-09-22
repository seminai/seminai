import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
/**
 * Integration test: double-approve idempotency on the field_note_agent
 * (PR-E of P2).
 *
 * Verifies that calling `approveAndExecute` twice in a row on the same
 * threadId after a REQUIRES_APPROVAL produces exactly one FieldNote row
 * — the second call must short-circuit on the `pendingAction` sentinel
 * cleared by the first call.
 *
 * Uses the real LLM (OpenRouter). Skipped if OPENROUTER_API_KEY is missing.
 *
 * Run:
 *   npm run test:integration -- --testPathPattern double-approve-idempotent
 */

import { randomUUID } from 'crypto';
import { prisma, createTestUser, createTestCompany, deleteTestUser } from './helpers';
import {
  createFieldNoteAgentApp,
  handleUserMessage,
  approveAndExecute,
} from '../infrastructure/services/agents/field_note_agent';

jest.setTimeout(240_000); // 4 min — LLM calls can be slow

const hasLlmKey = !!process.env.OPENROUTER_API_KEY || !!process.env.OPENAI_API_KEY;
const describeIfLlm = hasLlmKey ? describe : describe.skip;

describeIfLlm('field_note_agent — double-approve idempotency (PR-E, integration)', () => {
  let testUserId: string;
  let testCompanyId: string;
  let testFieldId: string;
  let testWarehouseId: string;
  let testProductionUnitId: string;

  beforeAll(async () => {
    const testUser = await createTestUser();
    testUserId = testUser.id;

    const testCompany = await createTestCompany({
      userId: testUserId,
      name: 'Azienda PR-E Idempotency',
    });
    testCompanyId = testCompany.id;

    testWarehouseId = randomUUID();
    await prisma.warehouse.create({
      data: {
        id: testWarehouseId,
        companyId: testCompanyId,
        name: 'Magazzino Idempotency',
        address: 'Via Test 1',
        sezione: 'A',
        foglio: '1',
        particella: '1',
      },
    });

    testFieldId = randomUUID();
    await prisma.field.create({
      data: {
        id: testFieldId,
        companyId: testCompanyId,
        name: 'campo idempotency',
        address: 'Via Test 2',
        city: 'Verona',
        region: 'Veneto',
        nation: 'Italia',
        cap: '37100',
        latitude: 45.4,
        longitude: 10.9,
        sauHa: 5.0,
        superficieCatastaleMq: 50000,
        sezione: 'A',
        foglio: '10',
        particella: '100',
      },
    });

    testProductionUnitId = randomUUID();
    await prisma.productionUnit.create({
      data: {
        id: testProductionUnitId,
        name: 'PU Idempotency Vite',
        areaHa: 5.0,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      },
    });
    await prisma.productionUnitOnField.create({
      data: {
        productionUnitId: testProductionUnitId,
        fieldId: testFieldId,
        areaHaOnField: 5.0,
      },
    });
  });

  afterEach(async () => {
    await prisma.fieldNote.deleteMany({ where: { userId: testUserId } });
  });

  afterAll(async () => {
    await prisma.productionUnitOnField.deleteMany({
      where: { productionUnitId: testProductionUnitId },
    });
    await prisma.productionUnit.deleteMany({ where: { id: testProductionUnitId } });
    await prisma.field.deleteMany({ where: { companyId: testCompanyId } });
    await prisma.warehouse.deleteMany({ where: { companyId: testCompanyId } });
    await deleteTestUser();
  });

  it('two consecutive approveAndExecute calls produce exactly one FieldNote row', async () => {
    const threadId = `pr-e-double-approve-${Date.now()}`;
    const app = createFieldNoteAgentApp({
      userId: testUserId,
      prisma,
      modelName: LIVE_TEST_CHAT_MODEL,
      threadId,
    });

    // Phase 1 — produce a save proposal (REQUIRES_APPROVAL).
    const message =
      'Ho dato 5kg di rame sul campo idempotency oggi. ' +
      'Lo trovi sotto la PU Idempotency Vite. Confermami per salvare.';
    const proposal = await handleUserMessage(app, threadId, message);
    expect(proposal.status).toBe('REQUIRES_APPROVAL');

    const before = await prisma.fieldNote.count({ where: { userId: testUserId } });

    // Phase 2 — first approve: should save exactly one note.
    const first = await approveAndExecute(app, threadId, prisma, testUserId);
    expect(first.status).toBe('COMPLETED');
    const afterFirst = await prisma.fieldNote.count({ where: { userId: testUserId } });
    expect(afterFirst).toBe(before + 1);

    // Phase 3 — immediate replay (double click). Must be idempotent.
    const second = await approveAndExecute(app, threadId, prisma, testUserId);
    expect(second.status).toBe('COMPLETED');
    expect(second.message).toMatch(/Operazione già completata|non più disponibile/);
    const afterSecond = await prisma.fieldNote.count({ where: { userId: testUserId } });
    expect(afterSecond).toBe(afterFirst); // no duplicate row
  });
});

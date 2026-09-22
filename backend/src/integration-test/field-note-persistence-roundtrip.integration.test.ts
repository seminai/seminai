/**
 * Integration test: field_note_agent state survives a simulated server
 * restart thanks to the shared Postgres checkpointer (PR-G of P2).
 *
 * Flow:
 *   1. Build agent app via FieldNoteAgentRegistry, drive it to REQUIRES_APPROVAL.
 *   2. Clear the in-memory registry cache (simulates a process restart —
 *      the cached Runnable is gone but the Postgres checkpoint row is not).
 *   3. Build a fresh app via getOrCreateApp on the same threadId. Verify the
 *      pendingAction sentinel (PR-E) and the conversation messages were
 *      restored from Postgres.
 *   4. Approve and verify exactly one FieldNote row was created.
 *
 * Uses the real LLM (OpenRouter) and Postgres. Skipped if either is missing.
 *
 * Run:
 *   LANGGRAPH_CHECKPOINTER_MODE=postgres \
 *     npm run test:integration -- --testPathPattern field-note-persistence-roundtrip
 */

import { randomUUID } from 'crypto';
import { prisma, createTestUser, createTestCompany, deleteTestUser } from './helpers';
import { getFieldNoteAgentRegistry } from '../infrastructure/services/agents/field_note_agent/FieldNoteAgentRegistry';
import {
  handleUserMessage,
  approveAndExecute,
} from '../infrastructure/services/agents/field_note_agent';

jest.setTimeout(240_000);

const hasLlmKey = !!process.env.OPENROUTER_API_KEY || !!process.env.OPENAI_API_KEY;
const hasPostgres = !!process.env.DATABASE_URL || !!process.env.LANGGRAPH_CHECKPOINTER_URL;
const describeIfReady = hasLlmKey && hasPostgres ? describe : describe.skip;

describeIfReady('field_note_agent — Postgres checkpointer roundtrip (PR-G, integration)', () => {
  let testUserId: string;
  let testCompanyId: string;
  let testFieldId: string;
  let testProductionUnitId: string;
  let originalMode: string | undefined;

  beforeAll(async () => {
    originalMode = process.env.LANGGRAPH_CHECKPOINTER_MODE;
    // The factory defaults to MemorySaver when NODE_ENV=test. Force Postgres
    // so we exercise the real persistence path. The factory falls back to
    // MemorySaver automatically if connection fails, in which case the
    // `restored.pendingAction` assertion below will fail loudly.
    process.env.LANGGRAPH_CHECKPOINTER_MODE = 'postgres';

    const testUser = await createTestUser();
    testUserId = testUser.id;

    const testCompany = await createTestCompany({
      userId: testUserId,
      name: 'Azienda PR-G Persistence',
    });
    testCompanyId = testCompany.id;

    const warehouseId = randomUUID();
    await prisma.warehouse.create({
      data: {
        id: warehouseId,
        companyId: testCompanyId,
        name: 'Magazzino Persistence',
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
        name: 'campo persistence',
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
        name: 'PU Persistence Vite',
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

    if (originalMode === undefined) {
      delete process.env.LANGGRAPH_CHECKPOINTER_MODE;
    } else {
      process.env.LANGGRAPH_CHECKPOINTER_MODE = originalMode;
    }
  });

  it('restores pendingAction + messages after a simulated registry restart', async () => {
    const threadId = `pr-g-persistence-${Date.now()}`;
    const registry = getFieldNoteAgentRegistry();

    // Phase 1 — first invocation: build app, drive to REQUIRES_APPROVAL.
    const created = await registry.getOrCreateApp({ threadId, userId: testUserId, prisma });
    const message =
      'Ho dato 5kg di rame sul campo persistence oggi. ' +
      'Lo trovi sotto la PU Persistence Vite. Confermami per salvare.';
    const proposal = await handleUserMessage(created.app, threadId, message);
    expect(proposal.status).toBe('REQUIRES_APPROVAL');

    // Phase 2 — simulate restart: clear the in-memory registry cache. The
    // PostgresSaver row for this threadId remains in DB.
    registry.remove(threadId);

    // Phase 3 — rebuild app from scratch and assert the state was restored.
    const restored = await registry.getOrCreateApp({ threadId, userId: testUserId, prisma });
    expect(restored.app).not.toBe(created.app); // brand new Runnable instance

    type AppWithState = {
      getState: (config: unknown) => Promise<{ values: Record<string, unknown> }>;
    };
    const { createFieldNoteRunConfig } = await import(
      '../infrastructure/services/agents/field_note_agent/runtime'
    );
    const restoredState = await (restored.app as unknown as AppWithState).getState(
      createFieldNoteRunConfig(threadId),
    );

    expect(restoredState.values.pendingAction).toBeDefined();
    expect(Array.isArray(restoredState.values.messages)).toBe(true);
    expect((restoredState.values.messages as unknown[]).length).toBeGreaterThan(0);

    // Phase 4 — approve through the restored app and verify the save.
    const before = await prisma.fieldNote.count({ where: { userId: testUserId } });
    const approveResult = await approveAndExecute(restored.app, threadId, prisma, testUserId);
    expect(approveResult.status).toBe('COMPLETED');
    const after = await prisma.fieldNote.count({ where: { userId: testUserId } });
    expect(after).toBe(before + 1);
  });
});

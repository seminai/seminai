import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
/**
 * Integration test: full chat flow for dosage planning via the ReAct agent.
 *
 * Validates the conversational sequence:
 *   1. Discovery — agent finds production units and products via DB tools
 *   2. Structured questions — agent asks the user for planning preferences
 *   3. Summary & confirmation — agent presents recap, awaits explicit "sì"
 *   4. start_dosage_agent_job — destructive tool triggers approval gate
 *   (optional) 5. Approval — job is enqueued, working memory updated
 *
 * Uses real LLM (gpt-4o-mini) with realistic DB data.
 * Queue and DosageAgentJobRepository are mocked — no worker is started.
 *
 * Run:
 *   npm run test:integration -- --testPathPattern dosage-planning-chat
 */

import { randomUUID } from 'crypto';
import {
  createTestUser,
  createTestCompany,
  deleteAllTestCompanies,
  deleteTestUser,
  prisma,
} from './helpers';
import {
  createReactAgent,
  handleUserMessage,
  approveAction,
  resetThread,
  getAgentState,
} from '../infrastructure/services/agents/dosage_agent_react/DosageReactAgent';
import { getWorkingMemory } from '../infrastructure/services/agents/dosage_agent_react/working-memory';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import type { ITestUser, ITestCompany } from './helpers';

// ── Queue & repository mocks ──

const mockAddJob = jest.fn().mockResolvedValue('job-test-123');
const mockUpdateStatus = jest.fn().mockResolvedValue(undefined);

jest.mock('../infrastructure/queue/DosageAgentQueue', () => ({
  getDosageAgentQueue: () => ({ addJob: mockAddJob }),
}));

jest.mock('../infrastructure/repositories/PrismaDosageAgentJobRepository', () => ({
  PrismaDosageAgentJobRepository: jest.fn().mockImplementation(() => ({
    updateStatus: mockUpdateStatus,
    findById: jest.fn().mockResolvedValue(null),
  })),
}));

jest.setTimeout(600_000); // 10 min — matches the LLM bucket config; real-LLM multi-turn can be slow

// Ensure the invite code matches what createTestUser() expects
const originalInviteCode = process.env.INVITE_CODE;
process.env.INVITE_CODE = 'TEST_INVITE_CODE';

// ── Test data IDs (for cleanup) ──

let testUser: ITestUser;
let testCompany: ITestCompany;
let fieldId1: string;
let fieldId2: string;
let warehouseId: string;
const productIds: string[] = [];

// ── Setup & teardown ──

beforeAll(async () => {
  if (!process.env.OPENROUTER_API_KEY) return;

  testUser = await createTestUser();
  testCompany = await createTestCompany({
    userId: testUser.id,
    name: 'Azienda Agricola Test SRL',
  });

  // Warehouse
  const warehouse = await prisma.warehouse.create({
    data: {
      companyId: testCompany.id,
      name: 'Magazzino Principale',
      address: 'Via dei Campi 1',
      sezione: 'A',
      foglio: '10',
      particella: '123',
    },
  });
  warehouseId = warehouse.id;

  // Field 1 — Faenza
  const field1 = await prisma.field.create({
    data: {
      companyId: testCompany.id,
      name: 'Campo Vite Nord',
      coordinates: [11.88, 44.29],
      coordinatesGaussBoaga: [],
      gisHa: 8.5,
      sauHa: 8.0,
      city: 'Faenza',
      region: 'Emilia-Romagna',
    },
  });
  fieldId1 = field1.id;

  // Field 2 — Cesena
  const field2 = await prisma.field.create({
    data: {
      companyId: testCompany.id,
      name: 'Campo Melo Est',
      coordinates: [12.24, 44.14],
      coordinatesGaussBoaga: [],
      gisHa: 3.5,
      sauHa: 3.2,
      city: 'Cesena',
      region: 'Emilia-Romagna',
    },
  });
  fieldId2 = field2.id;

  // Production Unit 1 — Vite Trebbiano
  await prisma.productionUnit.create({
    data: {
      name: 'Vite - Trebbiano',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-10-15'),
      areaHa: 5.0,
      productionUnitsOnFields: {
        create: { fieldId: fieldId1, areaHaOnField: 5.0 },
      },
      cycles: {
        create: {
          cropName: 'Vite',
          cropType: 'Fruttifero',
          variety: 'Trebbiano',
          protocoll: 'Integrato',
          protectionStructure: 'Nessuna',
          acquaTotalePeridoL: 2500,
          seasonYear: 2026,
          cycleIndex: 1,
        },
      },
    },
  });

  // Production Unit 2 — Melo Golden Delicious
  await prisma.productionUnit.create({
    data: {
      name: 'Melo - Golden Delicious',
      startDate: new Date('2026-02-15'),
      endDate: new Date('2026-11-30'),
      areaHa: 3.5,
      productionUnitsOnFields: {
        create: { fieldId: fieldId2, areaHaOnField: 3.5 },
      },
      cycles: {
        create: {
          cropName: 'Melo',
          cropType: 'Fruttifero',
          variety: 'Golden Delicious',
          protocoll: 'Integrato',
          protectionStructure: 'Antigrandine',
          acquaTotalePeridoL: 3000,
          seasonYear: 2026,
          cycleIndex: 1,
        },
      },
    },
  });

  // Products with stock
  const productsData = [
    {
      name: 'Captano 80 WG',
      sku: 'CAP80WG',
      registrationNumber: '3872',
      category: 'PESTICIDE' as const,
      type: 'Fungicida',
      stockQty: 15,
      stockUnit: 'kg',
    },
    {
      name: 'Prolectus 50 WG',
      sku: 'PROL50WG',
      registrationNumber: '15549',
      category: 'PESTICIDE' as const,
      type: 'Fungicida',
      stockQty: 8,
      stockUnit: 'kg',
    },
    {
      name: 'Revysion',
      sku: 'REVYSION',
      registrationNumber: '17866',
      category: 'PESTICIDE' as const,
      type: 'Fungicida',
      stockQty: 5,
      stockUnit: 'L',
    },
  ];

  for (const pd of productsData) {
    const product = await prisma.product.create({
      data: {
        name: pd.name,
        sku: pd.sku,
        registrationNumber: pd.registrationNumber,
        category: pd.category,
        type: pd.type,
        warehouseId,
        stocks: {
          create: {
            quantity: pd.stockQty,
            unitOfMeasureQuantity: pd.stockUnit,
            price: 0,
            unitOfMeasurePrice: 'EUR',
            type: 'IN',
          },
        },
      },
    });
    productIds.push(product.id);
  }
});

afterAll(async () => {
  // Restore original invite code
  if (originalInviteCode) {
    process.env.INVITE_CODE = originalInviteCode;
  }

  if (!testUser) return;

  try {
    await deleteAllTestCompanies(testUser.id);
    await deleteTestUser();
  } catch (error) {
    console.error('Cleanup error:', error);
  }
});

// ── Test suite ──

describe('Dosage planning chat flow — full conversation', () => {
  let threadId: string;

  beforeEach(() => {
    threadId = `dosage-plan-${randomUUID()}`;
    mockAddJob.mockClear();
    mockUpdateStatus.mockClear();
  });

  afterEach(() => {
    resetThread(threadId);
  });

  it('should discover context, collect preferences, and reach approval gate for start_dosage_agent_job', async () => {
    if (!process.env.OPENROUTER_API_KEY) {
      console.log('⚠️  Skipping: OPENROUTER_API_KEY not available');
      return;
    }

    // Create a chat record so the agent can resolve chatId
    await prisma.chat.create({
      data: {
        userId: testUser.id,
        threadId,
        category: 'DOSAGE_AGENT',
      },
    });

    const app = await createReactAgent({
      threadId,
      modelName: LIVE_TEST_CHAT_MODEL,
      userId: testUser.id,
      skipRAG: true,
      skipDisciplinariPdf: true,
    });

    // ── Turn 1: user asks for dosage planning ──
    console.log('\n--- Turn 1: request planning ---');
    const r1 = await handleUserMessage(
      app,
      threadId,
      'Vorrei pianificare i trattamenti fitosanitari per la prossima stagione',
    );

    console.log(`  Status: ${r1.status}`);
    console.log(`  Message (first 300): ${r1.message?.substring(0, 300)}`);

    expect(r1.status).toBe('COMPLETED');
    expect(r1.message).toBeDefined();

    // The agent should have discovered PU and products via tools
    const wm1 = getWorkingMemory(threadId);
    const hasUnits = wm1.inputUnits && (wm1.inputUnits as unknown[]).length > 0;
    const hasProducts = wm1.inputProducts && (wm1.inputProducts as unknown[]).length > 0;

    const msg1Lower = (r1.message ?? '').toLowerCase();
    const referencesContext =
      msg1Lower.includes('vite') ||
      msg1Lower.includes('melo') ||
      msg1Lower.includes('trebbiano') ||
      msg1Lower.includes('golden') ||
      msg1Lower.includes('captano') ||
      msg1Lower.includes('prolectus') ||
      msg1Lower.includes('revysion') ||
      msg1Lower.includes('unità') ||
      msg1Lower.includes('prodott') ||
      hasUnits ||
      hasProducts;

    expect(referencesContext).toBe(true);

    // ── Turn 2: user provides all preferences ──
    // The LLM may either (a) present a summary and ask for confirmation or
    // (b) go straight to calling start_dosage_agent_job (approval gate).
    // Both paths are valid — we handle both.
    console.log('\n--- Turn 2: provide preferences ---');
    const r2 = await handleUserMessage(
      app,
      threadId,
      'Tutte le unità produttive, tutti i prodotti, prossimi 3 mesi a partire da oggi, ' +
        'strategia dose media, obiettivo equilibrato, no vincoli stock, ' +
        'priorità Peronospora e Oidio, intensità media',
    );

    console.log(`  Status: ${r2.status}`);
    console.log(`  Message (first 400): ${r2.message?.substring(0, 400)}`);

    // Working memory should be populated by now regardless of path
    const wm2 = getWorkingMemory(threadId);
    expect(wm2.inputUnits).toBeDefined();
    expect(wm2.inputProducts).toBeDefined();

    let approvalResponse = r2;

    if (r2.status === 'COMPLETED') {
      // Path A: agent asked for confirmation — send a third turn
      const msg2Lower = (r2.message ?? '').toLowerCase();
      const hasSummaryOrConfirmation =
        msg2Lower.includes('riepilog') ||
        msg2Lower.includes('riassunt') ||
        msg2Lower.includes('conferma') ||
        msg2Lower.includes('confermi') ||
        msg2Lower.includes('proceder') ||
        msg2Lower.includes('avviar') ||
        msg2Lower.includes('corretti') ||
        msg2Lower.includes('parametri') ||
        msg2Lower.includes('sommario');

      expect(hasSummaryOrConfirmation).toBe(true);

      console.log('\n--- Turn 3: user confirms ---');
      approvalResponse = await handleUserMessage(app, threadId, 'Sì, confermo. Avvia il calcolo.');

      console.log(`  Status: ${approvalResponse.status}`);
      console.log(`  Message (first 300): ${approvalResponse.message?.substring(0, 300)}`);
    }

    // At this point we expect the approval gate (start_dosage_agent_job is destructive)
    expect(approvalResponse.status).toBe('REQUIRES_APPROVAL');
    expect(approvalResponse.pendingToolCalls).toBeDefined();
    expect(approvalResponse.pendingToolCalls!.length).toBeGreaterThan(0);
    expect(approvalResponse.pendingToolCalls![0].name).toBe('start_dosage_agent_job');

    if (approvalResponse.pendingToolCalls) {
      console.log(
        `  Pending tool calls: ${JSON.stringify(approvalResponse.pendingToolCalls.map((t) => t.name))}`,
      );
    }

    // ── Approve the action ──
    console.log('\n--- Approve action ---');
    const rApproved = await approveAction(app, threadId);

    console.log(`  Status: ${rApproved.status}`);
    console.log(`  Message (first 300): ${rApproved.message?.substring(0, 300)}`);

    expect(rApproved.status).toBe('COMPLETED');
    expect(rApproved.message).toBeDefined();

    // Diagnostic dump in case the queue mock wasn't called: distinguishes between
    // (a) tool early-return (ToolMessage with toolError/toolMissingPrerequisite payload)
    // and (b) LLM that didn't invoke the tool at all (no matching ToolMessage).
    if (mockAddJob.mock.calls.length === 0) {
      const finalState = await getAgentState(app, threadId);
      const finalMessages = finalState.messages ?? [];
      const startJobToolMsg = [...finalMessages]
        .reverse()
        .find(
          (m): m is ToolMessage => m instanceof ToolMessage && m.name === 'start_dosage_agent_job',
        );
      const lastAI = [...finalMessages]
        .reverse()
        .find((m): m is AIMessage => m instanceof AIMessage);
      console.error('[DIAG] mockAddJob never called. Dumping post-approval state:');
      console.error(
        '  start_dosage_agent_job ToolMessage:',
        startJobToolMsg
          ? String(startJobToolMsg.content).slice(0, 800)
          : 'NOT FOUND (tool never executed)',
      );
      console.error('  Last AIMessage content:', lastAI?.content?.toString().slice(0, 600));
      console.error(
        '  Last AIMessage tool_calls:',
        JSON.stringify(
          (
            lastAI as AIMessage & { tool_calls?: Array<{ name: string; args: unknown }> }
          )?.tool_calls?.map((tc) => ({ name: tc.name, args: tc.args })) ?? [],
        ),
      );
      const wmDiag = getWorkingMemory(threadId);
      console.error(
        '  Working memory: inputProducts=',
        Array.isArray(wmDiag.inputProducts) ? wmDiag.inputProducts.length : 'undefined',
        'inputUnits=',
        Array.isArray(wmDiag.inputUnits) ? wmDiag.inputUnits.length : 'undefined',
      );
    }

    // Verify the queue mock was called with the right shape
    expect(mockAddJob).toHaveBeenCalledTimes(1);
    const addJobArg = mockAddJob.mock.calls[0][0];
    expect(addJobArg).toHaveProperty('input');
    expect(addJobArg).toHaveProperty('userId', testUser.id);
    expect(addJobArg.input).toHaveProperty('products');
    expect(addJobArg.input).toHaveProperty('unitOfProduction');
    expect(addJobArg.input.products.length).toBeGreaterThanOrEqual(1);
    expect(addJobArg.input.unitOfProduction.length).toBeGreaterThanOrEqual(1);

    // Verify the status was updated to QUEUED (enum value is lowercase 'queued')
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-test-123',
        state: 'queued',
      }),
    );

    // Working memory should have the jobId
    const wmFinal = getWorkingMemory(threadId);
    expect(wmFinal.dosageJobId).toBe('job-test-123');

    // The final response should mention the job
    const msgFinalLower = (rApproved.message ?? '').toLowerCase();
    expect(msgFinalLower).toMatch(/job|avviat|calcol|pianificazione|elaborazione/);
  }, 600_000);
});

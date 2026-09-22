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
import { deleteAllTestCompanies, deleteTestUser, prisma } from './helpers';
import { createReactAgent, handleUserMessage, approveAction, resetThread, getAgentState } from '../infrastructure/services/agents/dosage_agent_react/DosageReactAgent';
import { getWorkingMemory } from '../infrastructure/services/agents/dosage_agent_react/working-memory';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import type { ITestUser } from './helpers';
import { setupDosagePlanningFixture } from './dosage-planning-chat.harness';
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
const originalInviteCode = process.env.INVITE_CODE;
process.env.INVITE_CODE = 'TEST_INVITE_CODE';
let testUser: ITestUser;
beforeAll(async () => {
  ({ testUser } = await setupDosagePlanningFixture());
});
afterAll(async () => {
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
    const wm2 = getWorkingMemory(threadId);
    expect(wm2.inputUnits).toBeDefined();
    expect(wm2.inputProducts).toBeDefined();
    let approvalResponse = r2;
    if (r2.status === 'COMPLETED') {
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
    expect(approvalResponse.status).toBe('REQUIRES_APPROVAL');
    expect(approvalResponse.pendingToolCalls).toBeDefined();
    expect(approvalResponse.pendingToolCalls!.length).toBeGreaterThan(0);
    expect(approvalResponse.pendingToolCalls![0].name).toBe('start_dosage_agent_job');
    if (approvalResponse.pendingToolCalls) {
      console.log(
        `  Pending tool calls: ${JSON.stringify(approvalResponse.pendingToolCalls.map((t) => t.name))}`,
      );
    }
    console.log('\n--- Approve action ---');
    const rApproved = await approveAction(app, threadId);
    console.log(`  Status: ${rApproved.status}`);
    console.log(`  Message (first 300): ${rApproved.message?.substring(0, 300)}`);
    expect(rApproved.status).toBe('COMPLETED');
    expect(rApproved.message).toBeDefined();
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
    expect(mockAddJob).toHaveBeenCalledTimes(1);
    const addJobArg = mockAddJob.mock.calls[0][0];
    expect(addJobArg).toHaveProperty('input');
    expect(addJobArg).toHaveProperty('userId', testUser.id);
    expect(addJobArg.input).toHaveProperty('products');
    expect(addJobArg.input).toHaveProperty('unitOfProduction');
    expect(addJobArg.input.products.length).toBeGreaterThanOrEqual(1);
    expect(addJobArg.input.unitOfProduction.length).toBeGreaterThanOrEqual(1);
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-test-123',
        state: 'queued',
      }),
    );
    const wmFinal = getWorkingMemory(threadId);
    expect(wmFinal.dosageJobId).toBe('job-test-123');
    const msgFinalLower = (rApproved.message ?? '').toLowerCase();
    expect(msgFinalLower).toMatch(/job|avviat|calcol|pianificazione|elaborazione/);
  }, 600_000);
});

import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
/**
 * E2E integration test: full LLM-driven flow for the normalize_extraction step.
 *
 * Validates with a real LLM (gpt-4o-mini):
 *   1. Happy path  — Piano Colturale: extract→normalize→review with all fields new
 *   2. Occupied    — existing field + overlapping UP → status='occupied' + payload
 *   3. Import      — import_from_file respects wm.fieldOccupationDecisions={reuse}
 *
 * Skipped when OPENROUTER_API_KEY is missing. Cost ~$0.15 / run, duration 3-5 min.
 *
 * Run:
 *   OPENROUTER_API_KEY=... npm run test:integration -- --testPathPattern=normalize-extraction-e2e
 */
import { randomUUID } from 'crypto';
import { ToolMessage } from '@langchain/core/messages';
import {
  createTestUser,
  createTestCompany,
  prisma,
  type ITestUser,
  type ITestCompany,
} from './helpers';
import {
  createReactAgent,
  handleUserMessage,
  approveAction,
  getAgentState,
  resetThread,
} from '../infrastructure/services/agents/dosage_agent_react/DosageReactAgent';
import {
  clearWorkingMemory,
  getWorkingMemory,
  updateWorkingMemory,
} from '../infrastructure/services/agents/dosage_agent_react/working-memory';
import type { ExtractionReviewPayload } from '../infrastructure/services/agents/dosage_agent_react/type/events';
import type { NormalizedExtraction } from '../application/services/extraction-normalization/normalized-extraction.types';

// ── Mocks ──

const mockAddJob = jest.fn().mockResolvedValue('job-test-123');
jest.mock('../infrastructure/queue/DosageAgentQueue', () => ({
  getDosageAgentQueue: () => ({ addJob: mockAddJob }),
}));
jest.mock('../infrastructure/repositories/PrismaDosageAgentJobRepository', () => ({
  PrismaDosageAgentJobRepository: jest.fn().mockImplementation(() => ({
    updateStatus: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(null),
  })),
}));

const capturedReviewPayloads: ExtractionReviewPayload[] = [];
jest.mock(
  '../infrastructure/services/agents/dosage_agent_react/socket/chat-socket-emitter',
  () => ({
    createChatEmitter: jest.fn(() => ({
      emitStreamEvent: jest.fn(),
      emitStreamEventRaw: jest.fn(),
      emitTaskUpdate: jest.fn(),
      emitMemoryUpdate: jest.fn(),
      emitSubagentProgress: jest.fn(),
      emitExtractionProgress: jest.fn(),
      emitExtractionComplete: jest.fn(),
      emitExtractionFailed: jest.fn(),
      emitExtractionReviewPresented: jest.fn((p: ExtractionReviewPayload) =>
        capturedReviewPayloads.push(p),
      ),
      emitExtractionReviewSaved: jest.fn(),
      emitExtractionReviewCancelled: jest.fn(),
      emitExtractionArchived: jest.fn(),
      emitPipelineProgress: jest.fn(),
      emitFollowUpSuggestions: jest.fn(),
      emitOuterLoopAlert: jest.fn(),
    })),
  }),
);

jest.setTimeout(300_000);

// ── Helpers ──

function toolSequence(messages: readonly unknown[]): string[] {
  return messages
    .filter((m): m is ToolMessage => m instanceof ToolMessage)
    .map((m) => m.name as string);
}

function buildExtractedFileData(includeOccupiedCadastral: boolean) {
  return {
    companies: [],
    fields: [
      {
        name: 'Vigna A',
        foglio: '12',
        particella: '34',
        comune: 'Verona',
        usiSuolo: ['Vite'],
        sauHa: 2,
      },
      {
        name: 'Vigna B',
        foglio: '13',
        particella: '5',
        comune: 'Verona',
        usiSuolo: ['Vite'],
        sauHa: 1,
      },
      {
        name: 'Oliveto',
        foglio: '20',
        particella: '7',
        comune: 'Lazise',
        usiSuolo: ['Olivo'],
        sauHa: 3,
      },
    ],
    productionUnits: [
      ...(includeOccupiedCadastral
        ? [
            {
              name: 'UP Vite A',
              cropType: 'Da vino',
              protocoll: 'Convenzionale',
              areaHa: 2,
              cycles: [
                {
                  cropName: 'Vite',
                  variety: 'Sangiovese',
                  startDate: '2026-04-01',
                  endDate: '2026-10-15',
                },
              ],
              allocations: [{ foglio: '12', particella: '34' }],
            },
          ]
        : []),
      {
        name: 'UP Vite B',
        cropType: 'Da vino',
        protocoll: 'Convenzionale',
        areaHa: 1,
        cycles: [
          {
            cropName: 'Vite',
            variety: 'Sangiovese',
            startDate: '2026-04-01',
            endDate: '2026-10-15',
          },
        ],
        allocations: [{ foglio: '13', particella: '5' }],
      },
      {
        name: 'UP Olivo',
        cropType: 'Olio',
        protocoll: 'Biologico',
        areaHa: 3,
        cycles: [
          {
            cropName: 'Olivo',
            variety: 'Frantoio',
            startDate: '2026-05-01',
            endDate: '2026-11-30',
          },
        ],
        allocations: [{ foglio: '20', particella: '7' }],
      },
    ],
  };
}

async function seedOccupiedField(companyId: string): Promise<string> {
  const field = await prisma.field.create({
    data: {
      name: 'Campo Preesistente',
      companyId,
      coordinates: [],
      foglio: '12',
      particella: '34',
      city: 'Verona',
      sauHa: 2,
      uso: 'Vite',
    },
  });
  const pu = await prisma.productionUnit.create({
    data: {
      name: 'UP preesistente',
      areaHa: 2,
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-11-30'),
    },
  });
  await prisma.productionCycle.create({
    data: {
      productionUnitId: pu.id,
      cropName: 'Vite',
      cropType: 'Da vino',
      variety: 'Sangiovese',
      protocoll: 'Convenzionale',
      seasonYear: 2026,
      cycleIndex: 0,
      protectionStructure: 'Nessuna',
      acquaTotalePeridoL: 0,
    },
  });
  await prisma.productionUnitOnField.create({
    data: { productionUnitId: pu.id, fieldId: field.id, areaHaOnField: 2 },
  });
  return field.id;
}

// ── Test ──

const describeIfLLM = process.env.OPENROUTER_API_KEY ? describe : describe.skip;

describeIfLLM('normalize_extraction E2E (LLM-driven)', () => {
  let testUser: ITestUser;
  let testCompany: ITestCompany;

  beforeAll(async () => {
    testUser = await createTestUser();
    testCompany = await createTestCompany({
      userId: testUser.id,
      name: 'Agri E2E SRL',
    });
  });

  beforeEach(() => {
    capturedReviewPayloads.length = 0;
  });

  it('Scenario 1: happy path — agent calls normalize_extraction then present_extraction_review', async () => {
    const threadId = `e2e-happy-${randomUUID()}`;
    const app = await createReactAgent({
      threadId,
      modelName: LIVE_TEST_CHAT_MODEL,
      userId: testUser.id,
      skipRAG: true,
      skipDisciplinariPdf: true,
    });
    updateWorkingMemory(threadId, {
      extractedFileData: buildExtractedFileData(false),
    });

    const response = await handleUserMessage(
      app,
      threadId,
      `Ho già estratto i dati di un Piano Colturale per @${testCompany.name} ` +
        `(companyId=${testCompany.id}). I dati sono in wm.extractedFileData. ` +
        `Procedi con normalize_extraction e mostrami subito il form di revisione.`,
    );

    expect(response.status).not.toBe('ERROR');
    const state = await getAgentState(app, threadId);
    const tools = toolSequence(state.messages as readonly unknown[]);
    const normalizeIdx = tools.indexOf('normalize_extraction');
    const reviewIdx = tools.indexOf('present_extraction_review');
    expect(normalizeIdx).toBeGreaterThanOrEqual(0);
    expect(reviewIdx).toBeGreaterThan(normalizeIdx);

    const wm = getWorkingMemory(threadId);
    const normalized = wm.normalizedExtraction as NormalizedExtraction;
    expect(normalized.stats.fieldsNew).toBe(3);
    expect(normalized.stats.fieldsOccupied).toBe(0);
    expect(capturedReviewPayloads.length).toBeGreaterThanOrEqual(1);
    const lastPayload = capturedReviewPayloads[capturedReviewPayloads.length - 1];
    expect(lastPayload.normalization?.fields.every((f) => f.status === 'new')).toBe(true);

    resetThread(threadId);
    clearWorkingMemory(threadId);
  });

  it('Scenario 2: occupied — payload contains field with status=occupied + occupiedBy', async () => {
    const existingFieldId = await seedOccupiedField(testCompany.id);
    const threadId = `e2e-occupied-${randomUUID()}`;
    const app = await createReactAgent({
      threadId,
      modelName: LIVE_TEST_CHAT_MODEL,
      userId: testUser.id,
      skipRAG: true,
      skipDisciplinariPdf: true,
    });
    updateWorkingMemory(threadId, {
      extractedFileData: buildExtractedFileData(true),
    });

    const response = await handleUserMessage(
      app,
      threadId,
      `Ho già estratto i dati di un Piano Colturale per @${testCompany.name} ` +
        `(companyId=${testCompany.id}). I dati sono in wm.extractedFileData. ` +
        `Procedi con normalize_extraction e mostrami subito il form di revisione.`,
    );

    expect(response.status).not.toBe('ERROR');
    const wm = getWorkingMemory(threadId);
    const normalized = wm.normalizedExtraction as NormalizedExtraction;
    expect(normalized.stats.fieldsOccupied).toBeGreaterThanOrEqual(1);
    const occupied = normalized.fields.find((f) => f.status === 'occupied');
    expect(occupied?.existingFieldId).toBe(existingFieldId);
    expect(occupied?.occupiedBy?.[0]?.cropName).toBe('Vite');

    expect(capturedReviewPayloads.length).toBeGreaterThanOrEqual(1);
    const lastPayload = capturedReviewPayloads[capturedReviewPayloads.length - 1];
    const occupiedInPayload = lastPayload.normalization?.fields.find(
      (f) => f.status === 'occupied',
    );
    expect(occupiedInPayload?.occupiedBy?.length).toBeGreaterThanOrEqual(1);

    resetThread(threadId);
    clearWorkingMemory(threadId);
  });

  it('Scenario 3: import_from_file respects fieldOccupationDecisions=reuse', async () => {
    const existingFieldId = await seedOccupiedField(testCompany.id);
    const threadId = `e2e-import-${randomUUID()}`;
    const app = await createReactAgent({
      threadId,
      modelName: LIVE_TEST_CHAT_MODEL,
      userId: testUser.id,
      skipRAG: true,
      skipDisciplinariPdf: true,
    });

    const extractedFileData = buildExtractedFileData(true);
    const normalizedExtraction: NormalizedExtraction = {
      fields: [
        {
          tempId: 'ext-fld-001',
          status: 'occupied',
          existingFieldId,
          name: 'Vigna A',
          foglio: '12',
          particella: '34',
          comune: 'Verona',
          usiSuolo: ['Vite'],
          sauHa: 2,
          occupiedBy: [
            {
              productionUnitId: 'pu-x',
              productionUnitName: 'UP preesistente',
              cropName: 'Vite',
              startDate: '2026-03-01T00:00:00.000Z',
              endDate: '2026-11-30T00:00:00.000Z',
              areaHaUsed: 2,
            },
          ],
        },
      ],
      productionUnits: [],
      stats: {
        fieldsNew: 0,
        fieldsExisting: 0,
        fieldsOccupied: 1,
        productionUnitsGrouped: 0,
        rawRowsProcessed: 0,
      },
    };
    updateWorkingMemory(threadId, {
      extractedFileData,
      normalizedExtraction,
      fieldOccupationDecisions: { 'ext-fld-001': 'reuse' },
    });

    const fieldsBefore = await prisma.field.count({ where: { companyId: testCompany.id } });
    const response = await handleUserMessage(
      app,
      threadId,
      `Procedi con import_from_file per @${testCompany.name} (companyId=${testCompany.id}). ` +
        `wm.normalizedExtraction e wm.fieldOccupationDecisions sono già popolati. Conferma e importa.`,
    );
    let approval = response;
    if (response.status === 'COMPLETED') {
      approval = await handleUserMessage(
        app,
        threadId,
        'Sì, conferma e procedi con import_from_file.',
      );
    }
    expect(approval.status).toBe('REQUIRES_APPROVAL');
    expect(approval.pendingToolCalls?.[0]?.name).toBe('import_from_file');

    await approveAction(app, threadId);

    const fieldsAfter = await prisma.field.count({ where: { companyId: testCompany.id } });
    expect(fieldsAfter).toBe(fieldsBefore + 2);
    const allocationsOnExisting = await prisma.productionUnitOnField.count({
      where: { fieldId: existingFieldId },
    });
    expect(allocationsOnExisting).toBeGreaterThanOrEqual(1);

    resetThread(threadId);
    clearWorkingMemory(threadId);
  });
});

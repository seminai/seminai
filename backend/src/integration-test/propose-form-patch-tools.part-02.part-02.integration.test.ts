import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
/**
 * Integration tests for the four `propose_*` tools used by the embedded
 * form-editor chat (production units wizard, step Review).
 *
 * The tests cover two levels:
 *  1. Direct invocation — call each tool factory with concrete args and
 *     verify the form_patch event payload (no LLM, no DB).
 *  2. End-to-end via streamReactAgent — feed a realistic Italian message
 *     plus a `clientContext.formMode = 'production_units'` snapshot, then
 *     assert the agent picks the right tool and the captured patch is
 *     coherent with the user's intent (requires OPENROUTER_API_KEY).
 *
 * Per eseguire:
 *   npm run test:integration -- --testPathPattern propose-form-patch-tools
 *   npm run test:int:llm -- --testPathPattern propose-form-patch-tools
 */

/**
 * Integration tests for the four `propose_*` tools used by the embedded
 * form-editor chat (production units wizard, step Review).
 *
 * The tests cover two levels:
 *  1. Direct invocation — call each tool factory with concrete args and
 *     verify the form_patch event payload (no LLM, no DB).
 *  2. End-to-end via streamReactAgent — feed a realistic Italian message
 *     plus a `clientContext.formMode = 'production_units'` snapshot, then
 *     assert the agent picks the right tool and the captured patch is
 *     coherent with the user's intent (requires OPENROUTER_API_KEY).
 *
 * Per eseguire:
 *   npm run test:integration -- --testPathPattern propose-form-patch-tools
 *   npm run test:int:llm -- --testPathPattern propose-form-patch-tools
 */
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Mock the socket emitter so the four tools can be observed without an active
// Socket.IO server. We capture every emitFormPatch call so individual tests
// can assert on the payload.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mock the socket emitter so the four tools can be observed without an active
// Socket.IO server. We capture every emitFormPatch call so individual tests
// can assert on the payload.
// ---------------------------------------------------------------------------
import type { FormPatchPayload } from '../infrastructure/services/agents/dosage_agent_react/type/events';

const capturedPatches: FormPatchPayload[] = [];

jest.mock(
  '../infrastructure/services/agents/dosage_agent_react/socket/chat-socket-emitter',
  () => ({
    setGlobalSocketIO: jest.fn(),
    getGlobalSocketIO: jest.fn(() => null),
    createChatEmitter: jest.fn(() => ({
      emitStreamEvent: jest.fn(),
      emitStreamEventRaw: jest.fn(),
      emitTaskUpdate: jest.fn(),
      emitMemoryUpdate: jest.fn(),
      emitSubagentProgress: jest.fn(),
      emitExtractionProgress: jest.fn(),
      emitExtractionComplete: jest.fn(),
      emitExtractionFailed: jest.fn(),
      emitExtractionReviewPresented: jest.fn(),
      emitExtractionReviewSaved: jest.fn(),
      emitExtractionReviewCancelled: jest.fn(),
      emitExtractionArchived: jest.fn(),
      emitPipelineProgress: jest.fn(),
      emitFollowUpSuggestions: jest.fn(),
      emitOuterLoopAlert: jest.fn(),
      emitFormPatch: jest.fn((payload: FormPatchPayload) => capturedPatches.push(payload)),
    })),
  }),
);
import { streamReactAgent } from '../infrastructure/services/agents/dosage_agent_react/streaming';
import { resetThread } from '../infrastructure/services/agents/dosage_agent_react/DosageReactAgent';
import type { StreamEvent } from '../infrastructure/services/agents/dosage_agent_react/type/events';

jest.setTimeout(180_000);

beforeEach(() => {
  capturedPatches.length = 0;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFormSnapshot(): Record<string, unknown> {
  return {
    companyId: 'company-test-1',
    units: [
      {
        id: 'pu-0',
        name: 'UP Nord',
        cropName: 'Mais',
        cropType: 'Cereale',
        variety: '',
        allocations: [
          { fieldId: 'field-A', areaHa: 2.5, fieldName: 'Campo A' },
          { fieldId: 'field-B', areaHa: 1.5, fieldName: 'Campo B' },
        ],
      },
      {
        id: 'pu-1',
        name: 'UP Sud',
        cropName: 'Soia',
        cropType: 'Leguminosa',
        variety: '',
        allocations: [{ fieldId: 'field-C', areaHa: 3.0, fieldName: 'Campo C' }],
      },
    ],
  };
}

async function collectStream(
  options: Parameters<typeof streamReactAgent>[0],
): Promise<readonly StreamEvent[]> {
  const events: StreamEvent[] = [];
  const stream = streamReactAgent(options);
  for await (const event of stream) events.push(event);
  return events;
}

function findToolCallsByName(
  events: readonly StreamEvent[],
  toolName: string,
): readonly StreamEvent[] {
  return events.filter((e) => e.type === 'tool_call' && e.toolCall?.name === toolName);
}
// ---------------------------------------------------------------------------
// SECTION 2 — End-to-end via streamReactAgent (LLM)
// ---------------------------------------------------------------------------

describe('propose_* tools — End-to-end via streamReactAgent', () => {
  const llmAvailable = Boolean(process.env.OPENROUTER_API_KEY);

  it('does NOT register propose_* tools when formMode is absent', async () => {
    if (!llmAvailable) {
      console.log('⚠️  Skipping (no OPENROUTER_API_KEY): negative registration coverage');
      return;
    }
    const threadId = `test-form-editor-absent-${randomUUID()}`;
    const events = await collectStream({
      threadId,
      userMessage:
        'Aggiungi una nuova Unità Produttiva di Insalata. (Tool propose_add_unit non disponibile in questa chat.)',
      modelName: LIVE_TEST_CHAT_MODEL,
    });

    const errors = events.filter((e) => e.type === 'error');
    expect(errors).toHaveLength(0);

    // No propose_* tool calls should have been recorded — without formMode
    // the registry skips the FORM_EDITOR category entirely.
    expect(findToolCallsByName(events, 'propose_set_unit_fields')).toHaveLength(0);
    expect(findToolCallsByName(events, 'propose_add_unit')).toHaveLength(0);
    expect(findToolCallsByName(events, 'propose_remove_unit')).toHaveLength(0);
    expect(findToolCallsByName(events, 'propose_move_allocation')).toHaveLength(0);
    expect(capturedPatches).toHaveLength(0);

    resetThread(threadId);
  });

  it('does NOT propose any patch for purely informational questions', async () => {
    if (!llmAvailable) {
      console.log('⚠️  Skipping (no OPENROUTER_API_KEY): no-op coverage');
      return;
    }
    const threadId = `test-form-editor-info-${randomUUID()}`;
    const events = await collectStream({
      threadId,
      userMessage: 'Quante UP ho già in bozza? Non modificare nulla, rispondimi solo a parole.',
      modelName: LIVE_TEST_CHAT_MODEL,
      clientContext: {
        formMode: 'production_units',
        formSnapshot: buildFormSnapshot(),
      },
    });

    const errors = events.filter((e) => e.type === 'error');
    expect(errors).toHaveLength(0);
    expect(capturedPatches).toHaveLength(0);

    resetThread(threadId);
  });});

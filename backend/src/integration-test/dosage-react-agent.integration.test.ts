import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
/**
 * Integration tests for the Dosage ReAct Agent.
 *
 * Tests cover:
 *  1. Foundation — Working memory, loop detection (no LLM needed)
 *  2. Tool invocation — Individual tool tests (some need LLM)
 *  3. Graph compilation — Agent creation with various configs
 *  4. Agent conversation — Full ReAct loop with LLM
 *  5. Approval gate — Destructive tool interruption
 *  6. Streaming — Event emission during execution
 *
 * Per eseguire:
 *   npm run test:integration -- --testPathPattern dosage-react-agent
 */

import { randomUUID } from 'crypto';
import { AgentResponseStatus, ChatCategory, MessageRole } from '@prisma/client';
import {
  createReactAgent,
  handleUserMessage,
  getAgentState,
  resetThread,
  extractSourcesFromMessages,
} from '../infrastructure/services/agents/dosage_agent_react/DosageReactAgent';
import { streamReactAgent } from '../infrastructure/services/agents/dosage_agent_react/streaming';
import {
  getWorkingMemory,
  updateWorkingMemory,
  clearWorkingMemory,
  hasWorkingMemoryData,
} from '../infrastructure/services/agents/dosage_agent_react/working-memory';
import { LoopDetector } from '../infrastructure/services/agents/dosage_agent_react/loop-detector';
import { createCheckRevokedTool } from '../infrastructure/services/agents/dosage_agent_react/tools/check-revoked.tool';
import { DESTRUCTIVE_TOOLS } from '../infrastructure/services/agents/dosage_agent_react/tools/create-jobs.tool';
import { DosageReactGraphFactory } from '../infrastructure/services/agents/dosage_agent_react/graph/DosageReactGraph';
import {
  routeAfterAgent,
  createRouteAfterGuard,
} from '../infrastructure/services/agents/dosage_agent_react/graph/routing';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { DosageReactState } from '../infrastructure/services/agents/dosage_agent_react/type/state';
import type { StreamEvent } from '../infrastructure/services/agents/dosage_agent_react/type/events';
import { createTestUser, prisma } from './helpers';
import { hasLlmGatewayKey } from '../test/llm-test-keys';

jest.setTimeout(180000); // 3 minutes for LLM tests

const routeAfterGuard = createRouteAfterGuard(new LoopDetector());

// ---------------------------------------------------------------------------
// SECTION 1 — Foundation (no LLM, no DB)
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Foundation', () => {
  describe('Working Memory', () => {
    const threadId = `test-wm-${randomUUID()}`;

    afterEach(() => {
      clearWorkingMemory(threadId);
    });

    it('should return empty object for new thread', () => {
      const mem = getWorkingMemory(threadId);
      expect(mem).toBeDefined();
      expect(Object.keys(mem)).toHaveLength(0);
    });

    it('should update and retrieve data', () => {
      updateWorkingMemory(threadId, {
        inputProducts: [{ name: 'Captano', regNumber: '123' }],
      });

      const mem = getWorkingMemory(threadId);
      expect(mem.inputProducts).toHaveLength(1);
      expect((mem.inputProducts![0] as any).name).toBe('Captano');
    });

    it('should shallow merge on update', () => {
      updateWorkingMemory(threadId, { inputProducts: [{ name: 'A' }] });
      updateWorkingMemory(threadId, { inputUnits: [{ id: 'u1' }] });

      const mem = getWorkingMemory(threadId);
      expect(mem.inputProducts).toHaveLength(1);
      expect(mem.inputUnits).toHaveLength(1);
    });

    it('should clear memory completely', () => {
      updateWorkingMemory(threadId, { inputProducts: [{ name: 'A' }] });
      clearWorkingMemory(threadId);

      expect(hasWorkingMemoryData(threadId, 'inputProducts')).toBe(false);
    });

    it('hasWorkingMemoryData should detect empty arrays', () => {
      updateWorkingMemory(threadId, { matchedProducts: [] });
      expect(hasWorkingMemoryData(threadId, 'matchedProducts')).toBe(false);
    });

    it('hasWorkingMemoryData should detect populated arrays', () => {
      updateWorkingMemory(threadId, { matchedProducts: [{ id: 'p1' }] as any });
      expect(hasWorkingMemoryData(threadId, 'matchedProducts')).toBe(true);
    });

    it('should isolate threads from each other', () => {
      const thread1 = `test-iso-1-${randomUUID()}`;
      const thread2 = `test-iso-2-${randomUUID()}`;

      updateWorkingMemory(thread1, { inputProducts: [{ name: 'A' }] });
      updateWorkingMemory(thread2, { inputProducts: [{ name: 'B' }] });

      expect((getWorkingMemory(thread1).inputProducts![0] as any).name).toBe('A');
      expect((getWorkingMemory(thread2).inputProducts![0] as any).name).toBe('B');

      clearWorkingMemory(thread1);
      clearWorkingMemory(thread2);
    });
  });

  describe('Loop Detector', () => {
    it('should return "ok" for few tool calls', () => {
      const detector = new LoopDetector();
      expect(detector.detect(['search_products', 'calculate_dosage'])).toBe('ok');
    });

    it('should return "warning" at threshold (8 calls)', () => {
      const detector = new LoopDetector();
      const history = Array(8).fill('check_product_revoked');
      // 8 identical calls will trigger pattern detection first
      expect(['warning', 'pattern']).toContain(detector.detect(history));
    });

    it('should return "critical" at 15 calls', () => {
      const detector = new LoopDetector();
      const history = Array(15)
        .fill(null)
        .map((_, i) => `tool_${i}`);
      expect(detector.detect(history)).toBe('critical');
    });

    it('should detect alternating pattern (A, B, A, B, A, B)', () => {
      const detector = new LoopDetector();
      const history = ['a', 'b', 'a', 'b', 'a', 'b'];
      expect(detector.detect(history)).toBe('pattern');
    });

    it('should detect same-tool repetition pattern', () => {
      const detector = new LoopDetector();
      const history = [
        'search_products',
        'search_products',
        'search_products',
        'search_products',
        'search_products',
        'search_products',
      ];
      expect(detector.detect(history)).toBe('pattern');
    });

    it('should detect period-3 pattern (A, B, C, A, B, C)', () => {
      const detector = new LoopDetector();
      const history = ['a', 'b', 'c', 'a', 'b', 'c'];
      expect(detector.detect(history)).toBe('pattern');
    });

    it('should return "ok" for diverse tool sequence', () => {
      const detector = new LoopDetector();
      const history = [
        'search_products',
        'calculate_dosage',
        'validate_compliance',
        'check_compatibility',
      ];
      expect(detector.detect(history)).toBe('ok');
    });

    it('should respect custom thresholds', () => {
      const detector = new LoopDetector({ warningThreshold: 3, criticalThreshold: 5 });
      expect(detector.detect(['a', 'b', 'c'])).toBe('warning');
      expect(detector.detect(['a', 'b', 'c', 'd', 'e'])).toBe('critical');
    });
  });

  describe('Routing Functions', () => {
    it('routeAfterAgent should route to "guard" when tool calls present', () => {
      const state: DosageReactState = {
        messages: [
          new AIMessage({
            content: 'Checking product...',
            tool_calls: [
              {
                name: 'check_product_revoked',
                args: { registrationNumber: '123' },
                id: 'tc1',
                type: 'tool_call',
              },
            ],
          }),
        ],
        loopCounter: 0,
        lastToolCalls: [],
        taskList: [],
      };

      expect(routeAfterAgent(state)).toBe('guard');
    });

    it('routeAfterAgent should route to END when no tool calls', () => {
      const state: DosageReactState = {
        messages: [new AIMessage({ content: 'Ecco la risposta.' })],
        loopCounter: 0,
        lastToolCalls: [],
        taskList: [],
      };

      expect(routeAfterAgent(state)).toBe('__end__');
    });

    it('routeAfterGuard should route to "approval_gate" for destructive tools', () => {
      const state: DosageReactState = {
        messages: [
          new AIMessage({
            content: '',
            tool_calls: [{ name: 'create_treatment_jobs', args: {}, id: 'tc1', type: 'tool_call' }],
          }),
        ],
        loopCounter: 1,
        lastToolCalls: ['search_products'],
        taskList: [],
      };

      expect(routeAfterGuard(state)).toBe('approval_gate');
    });

    it('routeAfterGuard should route to "execute" for non-destructive tools', () => {
      const state: DosageReactState = {
        messages: [
          new AIMessage({
            content: '',
            tool_calls: [{ name: 'check_product_revoked', args: {}, id: 'tc1', type: 'tool_call' }],
          }),
        ],
        loopCounter: 1,
        lastToolCalls: ['search_products'],
        taskList: [],
      };

      expect(routeAfterGuard(state)).toBe('execute');
    });

    it('routeAfterGuard should route to END on critical loop', () => {
      const state: DosageReactState = {
        messages: [
          new AIMessage({
            content: '',
            tool_calls: [{ name: 'search_products', args: {}, id: 'tc1', type: 'tool_call' }],
          }),
        ],
        loopCounter: 15,
        lastToolCalls: Array(15)
          .fill(null)
          .map((_, i) => `tool_${i}`),
        taskList: [],
      };

      expect(routeAfterGuard(state)).toBe('__end__');
    });
  });

  describe('DESTRUCTIVE_TOOLS Set', () => {
    it('should contain create_treatment_jobs', () => {
      expect(DESTRUCTIVE_TOOLS.has('create_treatment_jobs')).toBe(true);
    });

    it('should NOT contain computation tools', () => {
      expect(DESTRUCTIVE_TOOLS.has('search_products')).toBe(false);
      expect(DESTRUCTIVE_TOOLS.has('calculate_dosage')).toBe(false);
      expect(DESTRUCTIVE_TOOLS.has('check_product_revoked')).toBe(false);
    });
  });

  describe('Source Extraction', () => {
    it('should extract sources from Tavily ToolMessages', () => {
      const messages = [
        new HumanMessage('Cerca info'),
        new ToolMessage({
          content: `[SOURCE_1] Title: Article on pesticides URL: https://example.com/article Content: Some content Fragment: Key fragment about doses\n---`,
          name: 'tavily_scientific_search',
          tool_call_id: 'tc1',
        }),
      ];

      const sources = extractSourcesFromMessages(messages);
      expect(sources.length).toBeGreaterThanOrEqual(1);
      expect(sources[0].url).toBe('https://example.com/article');
    });

    it('should return empty array when no Tavily messages', () => {
      const messages = [
        new HumanMessage('Ciao'),
        new AIMessage({ content: 'Come posso aiutarti?' }),
      ];

      expect(extractSourcesFromMessages(messages)).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// SECTION 2 — Tool Direct Invocation
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Tool Invocation', () => {
  describe('check_product_revoked tool', () => {
    it('should be created with correct name and schema', () => {
      const tool = createCheckRevokedTool();
      expect(tool.name).toBe('check_product_revoked');
      expect(tool.description).toContain('revocati');
    });

    it('should return ATTIVO for a valid non-revoked product', async () => {
      const tool = createCheckRevokedTool();
      const result = await tool.invoke({
        registrationNumber: '99999',
        productName: 'Prodotto Inventato Test',
      });

      const parsed = JSON.parse(result);
      // A non-existent product should return ATTIVO (not in revoked dataset)
      // OR a warning if dataset not available
      expect(['ATTIVO', undefined]).toContain(parsed.status);
      if (parsed.status === 'ATTIVO') {
        expect(parsed.message).toContain('attivo');
      }
    });

    it('should handle batch mode with multiple products', async () => {
      const tool = createCheckRevokedTool();
      const result = await tool.invoke({
        products: [
          { regNumber: '99998', name: 'Fake Product A' },
          { regNumber: '99997', name: 'Fake Product B' },
        ],
      });

      const parsed = JSON.parse(result);
      // Either dataset not available warning OR batch results
      if (parsed.totalChecked !== undefined) {
        expect(parsed.totalChecked).toBe(2);
        expect(parsed.results).toHaveLength(2);
      }
    });

    it('should handle missing parameters gracefully', async () => {
      const tool = createCheckRevokedTool();
      const result = await tool.invoke({});
      const parsed = JSON.parse(result);
      // Should not throw — returns some valid JSON response
      expect(parsed).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// SECTION 3 — Graph Compilation & Agent Creation
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Graph & Agent Creation', () => {
  it('should create graph with minimal configuration', async () => {
    if (!hasLlmGatewayKey()) {
      console.log('⚠️  Skipping: OPENAI_API_KEY not available');
      return;
    }

    const factory = new DosageReactGraphFactory({
      threadId: `test-graph-${randomUUID()}`,
      modelName: LIVE_TEST_CHAT_MODEL,
    });

    const graph = factory.createGraph();
    expect(graph).toBeDefined();
  });

  it('should register all 13+ computation tools', async () => {
    if (!hasLlmGatewayKey()) {
      console.log('⚠️  Skipping: OPENAI_API_KEY not available');
      return;
    }

    // Capture console.log to verify tool registration message
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      const msg = args.map(String).join(' ');
      logs.push(msg);
      originalLog(...args);
    };

    const factory = new DosageReactGraphFactory({
      threadId: `test-tools-${randomUUID()}`,
      modelName: LIVE_TEST_CHAT_MODEL,
    });
    factory.createGraph();

    console.log = originalLog;

    const registrationLog = logs.find((l) => l.includes('[DosageReactGraph] Registered'));
    expect(registrationLog).toBeDefined();
    // At minimum: 13 computation + 1 disciplinari_database_search = 14
    const match = registrationLog!.match(/Registered (\d+) tools/);
    expect(match).toBeDefined();
    const toolCount = parseInt(match![1], 10);
    expect(toolCount).toBeGreaterThanOrEqual(14);
  });

  it('should create ReactAgent with skipRAG and skipDisciplinariPdf', async () => {
    if (!hasLlmGatewayKey()) {
      console.log('⚠️  Skipping: OPENAI_API_KEY not available');
      return;
    }

    const app = await createReactAgent({
      threadId: `test-create-${randomUUID()}`,
      modelName: LIVE_TEST_CHAT_MODEL,
      skipRAG: true,
      skipDisciplinariPdf: true,
    });

    expect(app).toBeDefined();
    expect(typeof app.stream).toBe('function');
    expect(typeof app.getState).toBe('function');
  });

  it('should create ReactAgent with initial working memory data', async () => {
    if (!hasLlmGatewayKey()) {
      console.log('⚠️  Skipping: OPENAI_API_KEY not available');
      return;
    }

    const threadId = `test-init-wm-${randomUUID()}`;
    const initialProducts = [{ name: 'Captano', regNumber: '123' }];
    const initialUnits = [{ id: 'pu1', cropName: 'Melo' }];

    await createReactAgent({
      threadId,
      modelName: LIVE_TEST_CHAT_MODEL,
      skipRAG: true,
      skipDisciplinariPdf: true,
      initialProducts,
      initialUnits,
    });

    expect(hasWorkingMemoryData(threadId, 'inputProducts')).toBe(true);
    expect(hasWorkingMemoryData(threadId, 'inputUnits')).toBe(true);
    expect(getWorkingMemory(threadId).inputProducts).toEqual(initialProducts);

    clearWorkingMemory(threadId);
  });

  it('should rebuild the cached app when a broader config is requested later', async () => {
    if (!hasLlmGatewayKey()) {
      console.log('⚠️  Skipping: OPENAI_API_KEY not available');
      return;
    }

    const threadId = `test-cache-upgrade-${randomUUID()}`;
    const firstApp = await createReactAgent({
      threadId,
      modelName: LIVE_TEST_CHAT_MODEL,
      skipRAG: true,
      skipDisciplinariPdf: true,
    });
    const secondApp = await createReactAgent({
      threadId,
      modelName: LIVE_TEST_CHAT_MODEL,
      userId: `user-${randomUUID()}`,
      jobId: `job-${randomUUID()}`,
      skipRAG: false,
      skipDisciplinariPdf: true,
    });

    expect(secondApp).not.toBe(firstApp);
    resetThread(threadId);
  });

  it('should reuse a richer cached app for narrower follow-up requests', async () => {
    if (!hasLlmGatewayKey()) {
      console.log('⚠️  Skipping: OPENAI_API_KEY not available');
      return;
    }

    const threadId = `test-cache-reuse-${randomUUID()}`;
    const userId = `user-${randomUUID()}`;
    const jobId = `job-${randomUUID()}`;
    const firstApp = await createReactAgent({
      threadId,
      modelName: LIVE_TEST_CHAT_MODEL,
      userId,
      jobId,
      skipRAG: false,
      skipDisciplinariPdf: true,
    });
    const secondApp = await createReactAgent({
      threadId,
      modelName: LIVE_TEST_CHAT_MODEL,
      userId,
      jobId,
      skipRAG: true,
      skipDisciplinariPdf: true,
    });

    expect(secondApp).toBe(firstApp);
    resetThread(threadId);
  });

  it('should restore persisted pending approval state from database on cold start', async () => {
    if (!hasLlmGatewayKey()) {
      console.log('⚠️  Skipping: OPENAI_API_KEY not available');
      return;
    }

    const threadId = `test-restore-pending-${randomUUID()}`;
    const user = await createTestUser();
    const chat = await prisma.chat.create({
      data: {
        userId: user.id,
        category: ChatCategory.DOSAGE_AGENT,
        threadId,
      },
    });
    await prisma.message.create({
      data: {
        chatId: chat.id,
        role: MessageRole.ASSISTANT,
        content: 'Pending approval',
        sequence: 0,
        status: AgentResponseStatus.REQUIRES_APPROVAL,
        pendingToolCalls: [{ name: 'create_treatment_jobs', args: { planId: 'p1' }, id: 'tc-1' }],
      },
    });

    const app = await createReactAgent({
      threadId,
      modelName: LIVE_TEST_CHAT_MODEL,
      skipRAG: true,
      skipDisciplinariPdf: true,
    });
    const state = await getAgentState(app, threadId);
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage & {
      tool_calls?: Array<{ name: string }>;
    };

    expect(lastMessage.tool_calls?.[0].name).toBe('create_treatment_jobs');
    await prisma.message.deleteMany({ where: { chatId: chat.id } });
    await prisma.chat.delete({ where: { id: chat.id } });
    resetThread(threadId);
  });

  it('should restore pending questionnaire metadata into working memory on cold start', async () => {
    if (!hasLlmGatewayKey()) {
      console.log('⚠️  Skipping: OPENAI_API_KEY not available');
      return;
    }

    const threadId = `test-restore-questionnaire-${randomUUID()}`;
    const user = await createTestUser();
    const chat = await prisma.chat.create({
      data: {
        userId: user.id,
        category: ChatCategory.DOSAGE_AGENT,
        threadId,
      },
    });
    await prisma.message.create({
      data: {
        chatId: chat.id,
        role: MessageRole.ASSISTANT,
        content: 'Please answer the questionnaire',
        sequence: 0,
        status: AgentResponseStatus.COMPLETED,
        metadata: {
          questionnaire: {
            title: 'Questionario',
            questions: [{ id: 'q1', question: 'Domanda', type: 'text', required: true }],
          },
        },
      },
    });

    await createReactAgent({
      threadId,
      modelName: LIVE_TEST_CHAT_MODEL,
      skipRAG: true,
      skipDisciplinariPdf: true,
    });

    expect(getWorkingMemory(threadId).pendingQuestionnaire).toMatchObject({
      title: 'Questionario',
    });
    await prisma.message.deleteMany({ where: { chatId: chat.id } });
    await prisma.chat.delete({ where: { id: chat.id } });
    resetThread(threadId);
  });

  it('builds via the model router without requiring OPENAI_API_KEY (multi-provider)', () => {
    // The factory routes through the shared model router, which is provider-agnostic
    // (claude / openai / openrouter). A missing OpenAI key must NOT break construction
    // when another provider is configured — here OpenRouter.
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      expect(() => {
        new DosageReactGraphFactory({
          threadId: `test-nokey-${randomUUID()}`,
          preferredProvider: 'openrouter',
        });
      }).not.toThrow();
    } finally {
      if (originalKey) {
        process.env.OPENAI_API_KEY = originalKey;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// SECTION 4 — Agent Conversation (LLM required)
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Conversation', () => {
  it('should answer a simple agronomic question without tools', async () => {
    if (!hasLlmGatewayKey()) {
      console.log('⚠️  Skipping: OPENAI_API_KEY not available');
      return;
    }

    const threadId = `test-simple-${randomUUID()}`;
    const app = await createReactAgent({
      threadId,
      modelName: LIVE_TEST_CHAT_MODEL,
      skipRAG: true,
      skipDisciplinariPdf: true,
    });

    const response = await handleUserMessage(
      app,
      threadId,
      "Cos'è il rame in agricoltura? Risposta breve.",
    );

    expect(response.status).toBe('COMPLETED');
    expect(response.message).toBeDefined();
    expect(response.message!.length).toBeGreaterThan(20);

    // Should mention copper/rame
    const lower = response.message!.toLowerCase();
    expect(lower).toMatch(/rame|copper|fungicid|batterios/i);

    console.log(`  → Simple Q&A: ${response.message!.substring(0, 150)}...`);
    resetThread(threadId);
  }, 60000);

  it('should use check_product_revoked tool when asked about a product', async () => {
    if (!hasLlmGatewayKey()) {
      console.log('⚠️  Skipping: OPENAI_API_KEY not available');
      return;
    }

    const threadId = `test-revoked-${randomUUID()}`;
    const app = await createReactAgent({
      threadId,
      modelName: LIVE_TEST_CHAT_MODEL,
      skipRAG: true,
      skipDisciplinariPdf: true,
    });

    const response = await handleUserMessage(
      app,
      threadId,
      'Il prodotto con numero di registrazione 15549 (Prolectus 50 WG) è stato revocato? Verifica con il tool check_product_revoked.',
    );

    expect(response.status).not.toBe('ERROR');
    expect(response.message).toBeDefined();
    expect(response.message!.length).toBeGreaterThan(10);

    // Check state — agent should have used tools
    const state = await getAgentState(app, threadId);
    expect(state.messages.length).toBeGreaterThan(2); // Human + AI + possible tool messages

    console.log(`  → Revoke check response: ${response.message!.substring(0, 200)}...`);
    resetThread(threadId);
  }, 60000);

  it('should handle multi-turn conversation', async () => {
    if (!hasLlmGatewayKey()) {
      console.log('⚠️  Skipping: OPENAI_API_KEY not available');
      return;
    }

    const threadId = `test-multiturn-${randomUUID()}`;
    const app = await createReactAgent({
      threadId,
      modelName: LIVE_TEST_CHAT_MODEL,
      skipRAG: true,
      skipDisciplinariPdf: true,
    });

    // Turn 1
    const r1 = await handleUserMessage(
      app,
      threadId,
      'Ciao, sono un agronomo. Ho bisogno di aiuto con i trattamenti.',
    );
    expect(r1.status).toBe('COMPLETED');
    expect(r1.message).toBeDefined();

    // Turn 2 — should maintain context
    const r2 = await handleUserMessage(
      app,
      threadId,
      'Puoi verificare se il prodotto con numero 99999 è revocato?',
    );
    expect(r2.status).not.toBe('ERROR');
    expect(r2.message).toBeDefined();

    // Verify conversation history accumulated
    const state = await getAgentState(app, threadId);
    expect(state.messages.length).toBeGreaterThan(3);

    console.log(`  → Turn 1: ${r1.message!.substring(0, 100)}...`);
    console.log(`  → Turn 2: ${r2.message!.substring(0, 100)}...`);
    resetThread(threadId);
  }, 90000);
});

// ---------------------------------------------------------------------------
// SECTION 5 — Streaming
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Streaming', () => {
  it('should emit token and complete events', async () => {
    if (!hasLlmGatewayKey()) {
      console.log('⚠️  Skipping: OPENAI_API_KEY not available');
      return;
    }

    const threadId = `test-stream-${randomUUID()}`;
    const events: StreamEvent[] = [];

    const stream = streamReactAgent({
      threadId,
      userMessage: 'Cosa è il rame in agricoltura? Risposta breve in 2 frasi.',
      modelName: LIVE_TEST_CHAT_MODEL,
    });

    let result;
    for await (const event of stream) {
      events.push(event);
      if (event.type === 'complete') {
        result = event;
      }
    }

    expect(events.length).toBeGreaterThan(0);

    // Should have at least some token events OR a complete event
    const tokenEvents = events.filter((e) => e.type === 'token');
    const completeEvents = events.filter((e) => e.type === 'complete');
    const errorEvents = events.filter((e) => e.type === 'error');

    // No errors
    expect(errorEvents).toHaveLength(0);
    expect(completeEvents).toHaveLength(1);
    if (tokenEvents.length > 0) {
      expect(tokenEvents[0]).toHaveProperty('content');
    }

    // Complete event should have cost info (may be zero if callbacks don't fire in stream mode)
    if (result && 'cost' in result) {
      expect((result as any).cost).toBeDefined();
    }

    console.log(`  → Stream events: ${events.length} total, ${tokenEvents.length} tokens`);
    resetThread(threadId);
  }, 60000);

  it('should emit tool_call events when agent uses tools', async () => {
    if (!hasLlmGatewayKey()) {
      console.log('⚠️  Skipping: OPENAI_API_KEY not available');
      return;
    }

    const threadId = `test-stream-tools-${randomUUID()}`;
    const events: StreamEvent[] = [];

    const stream = streamReactAgent({
      threadId,
      userMessage:
        'Verifica se il prodotto con numero di registrazione 15549 è revocato usando il tool check_product_revoked.',
      modelName: LIVE_TEST_CHAT_MODEL,
    });

    for await (const event of stream) {
      events.push(event);
    }

    const toolCallEvents = events.filter((e) => e.type === 'tool_call');
    const completeEvents = events.filter((e) => e.type === 'complete');
    const errorEvents = events.filter((e) => e.type === 'error');

    // Should complete without errors
    if (errorEvents.length > 0) {
      console.log(`  → Stream errors: ${JSON.stringify(errorEvents)}`);
    }
    expect(errorEvents).toHaveLength(0);
    expect(completeEvents).toHaveLength(1);

    console.log(`  → Stream: ${events.length} events, ${toolCallEvents.length} tool calls`);
    if (toolCallEvents.length > 0) {
      console.log(
        `  → Tools used: ${toolCallEvents.map((e) => (e as any).toolCall?.name).join(', ')}`,
      );
    }

    resetThread(threadId);
  }, 90000);
});

// ---------------------------------------------------------------------------
// SECTION 6 — Reset & Cleanup
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Reset & Cleanup', () => {
  it('resetThread should clear working memory', () => {
    const threadId = `test-reset-${randomUUID()}`;
    updateWorkingMemory(threadId, {
      inputProducts: [{ name: 'Test' }],
      dosageResults: [{ dose: 1 }] as any,
    });

    expect(hasWorkingMemoryData(threadId, 'inputProducts')).toBe(true);

    resetThread(threadId);

    expect(hasWorkingMemoryData(threadId, 'inputProducts')).toBe(false);
    expect(hasWorkingMemoryData(threadId, 'dosageResults')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SECTION 7 — Performance
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Performance', () => {
  it('agent creation (skipRAG + skipDisciplinariPdf) should complete within 3 seconds', async () => {
    if (!hasLlmGatewayKey()) {
      console.log('⚠️  Skipping: OPENAI_API_KEY not available');
      return;
    }

    const start = Date.now();
    const threadId = `test-perf-create-${randomUUID()}`;
    await createReactAgent({
      threadId,
      modelName: LIVE_TEST_CHAT_MODEL,
      skipRAG: true,
      skipDisciplinariPdf: true,
    });
    const latencyMs = Date.now() - start;

    console.log(`  → Agent creation latency: ${latencyMs}ms`);
    expect(latencyMs).toBeLessThan(3000);

    resetThread(threadId);
  }, 10000);

  it('simple response (no tools) should complete within 15 seconds', async () => {
    if (!hasLlmGatewayKey()) {
      console.log('⚠️  Skipping: OPENAI_API_KEY not available');
      return;
    }

    const threadId = `test-perf-simple-${randomUUID()}`;
    const app = await createReactAgent({
      threadId,
      modelName: LIVE_TEST_CHAT_MODEL,
      skipRAG: true,
      skipDisciplinariPdf: true,
    });

    const start = Date.now();
    const response = await handleUserMessage(app, threadId, 'Rispondi OK.');
    const latencyMs = Date.now() - start;

    console.log(`  → Simple response latency: ${latencyMs}ms`);
    expect(response.status).not.toBe('ERROR');
    expect(latencyMs).toBeLessThan(15000);

    resetThread(threadId);
  }, 30000);
});

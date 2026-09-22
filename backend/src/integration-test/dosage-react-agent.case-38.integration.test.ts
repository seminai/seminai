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
import { createReactAgent, handleUserMessage, resetThread } from '../infrastructure/services/agents/dosage_agent_react/DosageReactAgent';
import { hasLlmGatewayKey } from '../test/llm-test-keys';

jest.setTimeout(180000);
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
  }, 60000);});

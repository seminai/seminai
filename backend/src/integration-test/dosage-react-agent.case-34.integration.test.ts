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
import { createReactAgent, resetThread } from '../infrastructure/services/agents/dosage_agent_react/DosageReactAgent';
import { hasLlmGatewayKey } from '../test/llm-test-keys';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 3 — Graph Compilation & Agent Creation
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Graph & Agent Creation', () => {

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
  });});

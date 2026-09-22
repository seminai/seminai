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
import { DosageReactGraphFactory } from '../infrastructure/services/agents/dosage_agent_react/graph/DosageReactGraph';
import { hasLlmGatewayKey } from '../test/llm-test-keys';

jest.setTimeout(180000);
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
  });});

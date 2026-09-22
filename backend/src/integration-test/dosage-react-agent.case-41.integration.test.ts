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
import { resetThread } from '../infrastructure/services/agents/dosage_agent_react/DosageReactAgent';
import { streamReactAgent } from '../infrastructure/services/agents/dosage_agent_react/streaming';
import type { StreamEvent } from '../infrastructure/services/agents/dosage_agent_react/type/events';
import { hasLlmGatewayKey } from '../test/llm-test-keys';

jest.setTimeout(180000);
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

    let result: StreamEvent | undefined;
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
      expect(result.cost).toBeDefined();
    }

    console.log(`  → Stream events: ${events.length} total, ${tokenEvents.length} tokens`);
    resetThread(threadId);
  }, 60000);});

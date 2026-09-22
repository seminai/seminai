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
import { getWorkingMemory, updateWorkingMemory, clearWorkingMemory } from '../infrastructure/services/agents/dosage_agent_react/working-memory';

jest.setTimeout(180000);
// ---------------------------------------------------------------------------
// SECTION 1 — Foundation (no LLM, no DB)
// ---------------------------------------------------------------------------

describe('Dosage ReAct Agent — Foundation', () => {
  describe('Working Memory', () => {
    const threadId = `test-wm-${randomUUID()}`;

    afterEach(() => {
      clearWorkingMemory(threadId);
    });

    it('should isolate threads from each other', () => {
      const thread1 = `test-iso-1-${randomUUID()}`;
      const thread2 = `test-iso-2-${randomUUID()}`;

      updateWorkingMemory(thread1, { inputProducts: [{ name: 'A' }] });
      updateWorkingMemory(thread2, { inputProducts: [{ name: 'B' }] });

      expect(getWorkingMemory(thread1).inputProducts?.[0]).toMatchObject({ name: 'A' });
      expect(getWorkingMemory(thread2).inputProducts?.[0]).toMatchObject({ name: 'B' });

      clearWorkingMemory(thread1);
      clearWorkingMemory(thread2);
    });});});

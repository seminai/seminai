import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
/**
 * Integration smoke test for the Manufacturing ReAct Agent.
 *
 * Reuses the dosage graph via the MANUFACTURING bundle + domain (see
 * ManufactureChatAgent). Asserts the agent streams end-to-end and NEVER exposes
 * an agronomic tool. Real-LLM: skipped when no gateway key is configured.
 *
 *   npm run test:integration -- --testPathPattern manufacture-react-agent
 */
import { randomUUID } from 'crypto';
import { ManufactureChatAgent } from '../infrastructure/services/agents/chat-routing/ManufactureChatAgent';
import { resetThread } from '../infrastructure/services/agents/dosage_agent_react/DosageReactAgent';
import type { StreamEvent } from '../infrastructure/services/agents/dosage_agent_react';
import { createTestUser } from './helpers';
import { hasLlmGatewayKey } from '../test/llm-test-keys';

const AGRONOMIC_TOOLS = [
  'search_products',
  'calculate_dosage',
  'validate_compliance',
  'create_treatment_jobs',
  'generate_treatment_plan',
  'delegate_to_field_note',
  'start_dosage_agent_job',
  'get_weather_forecast',
  'list_production_units',
  'check_product_crop_authorizations',
];

describe('Manufacture ReAct Agent — Streaming smoke', () => {
  let userId: string;

  beforeAll(async () => {
    // Reuse the shared test user; do NOT delete it in afterAll — other
    // integration suites rely on it pre-existing across the run.
    const user = await createTestUser();
    userId = user.id;
  });

  it('streams a manufacturing query without ever exposing an agronomic tool', async () => {
    if (!hasLlmGatewayKey()) {
      console.log('⚠️  Skipping: OPENAI_API_KEY not available');
      return;
    }

    const agent = new ManufactureChatAgent();
    const threadId = `test-mfg-stream-${randomUUID()}`;
    const events: StreamEvent[] = [];

    const stream = agent.stream({
      threadId,
      userId,
      userMessage: 'Quali aziende ho a disposizione e che prodotti ho a magazzino? Risposta breve.',
      modelName: LIVE_TEST_CHAT_MODEL,
    });

    for await (const event of stream) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
    expect(events.filter((e) => e.type === 'error')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'complete')).toHaveLength(1);

    // No agronomic tool may ever be called by the manufacturing agent.
    const serialized = JSON.stringify(events);
    for (const agronomicTool of AGRONOMIC_TOOLS) {
      expect(serialized).not.toContain(agronomicTool);
    }

    resetThread(threadId);
  }, 60000);
});

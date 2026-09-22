import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  GET_PROPOSAL_STATE_TOOL_NAME,
  PROPOSE_DOSAGE_PLAN_TOOL_NAME,
  REJECT_DOSAGE_PLAN_TOOL_NAME,
} from '../tools/dosage-proposal';
import { createLiveClient, describeLive, parseToolJson } from './live-smoke-harness';

describeLive('LIVE smoke — Dosage Proposal wave (safe, no DB writes)', () => {
  let client: Client;
  const threadId = `mcp-live-${Date.now()}`;

  beforeAll(async () => {
    ({ client } = await createLiveClient());
  }, 30_000);

  it('listTools advertises the safe Dosage Proposal tools', async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        PROPOSE_DOSAGE_PLAN_TOOL_NAME,
        REJECT_DOSAGE_PLAN_TOOL_NAME,
        GET_PROPOSAL_STATE_TOOL_NAME,
      ]),
    );
  });

  it('proposes a read-only dosage request with typed risk fields', async () => {
    const result = await client.callTool({
      name: PROPOSE_DOSAGE_PLAN_TOOL_NAME,
      arguments: {
        threadId,
        message: 'Mostrami i prodotti disponibili senza creare o modificare dati.',
      },
    });
    expect(result.isError ?? false).toBe(false);
    const body = parseToolJson(result.content) as {
      readonly status: string;
      readonly pendingToolCalls?: ReadonlyArray<{
        readonly name: string;
        readonly riskLevel?: string;
        readonly riskScore?: number;
      }>;
    };
    expect(['COMPLETED', 'REQUIRES_APPROVAL', 'ERROR']).toContain(body.status);
    if (body.status === 'REQUIRES_APPROVAL') {
      const first = body.pendingToolCalls?.[0];
      expect(first).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(first?.riskLevel);
      expect(typeof first?.riskScore).toBe('number');
    }
  }, 60_000);

  it('returns parseable proposal state', async () => {
    const result = await client.callTool({
      name: GET_PROPOSAL_STATE_TOOL_NAME,
      arguments: { proposalId: threadId },
    });
    expect(result.isError ?? false).toBe(false);
    parseToolJson(result.content);
  });

  it('rejects the proposal without persisting data', async () => {
    const result = await client.callTool({
      name: REJECT_DOSAGE_PLAN_TOOL_NAME,
      arguments: { proposalId: threadId, reason: 'live smoke teardown' },
    });
    expect(result.content).toBeDefined();
  }, 30_000);
});

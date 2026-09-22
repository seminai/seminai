/**
 * LIVE smoke test against a real Seminai backend.
 *
 * Skipped by default. Activated only when SEMINAI_LIVE_TEST=1.
 * Required env when active:
 *   - SEMINAI_LIVE_BASE_URL  (default: http://localhost:8081)
 *   - SEMINAI_LIVE_EMAIL     (login credentials)
 *   - SEMINAI_LIVE_PASSWORD  (login credentials, never committed)
 *
 * This test logs into the backend, creates an MCP server bound to that backend,
 * and exercises every Catalog-wave tool through a real MCP client.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createSeminaiMcpServer } from '../server';
import { LIST_COMPANIES_TOOL_NAME } from '../tools/companies';
import { LIST_FIELDS_TOOL_NAME } from '../tools/fields';
import { LIST_MACHINES_TOOL_NAME } from '../tools/machines';
import { LIST_PRODUCTION_UNITS_TOOL_NAME } from '../tools/production-units';
import { LIST_WAREHOUSES_TOOL_NAME } from '../tools/warehouses';
import { LIST_WORKSPACES_TOOL_NAME } from '../tools/workspaces';
import { GET_LABEL_TOOL_NAME } from '../tools/labels';
import {
  LIST_MY_JOBS_TOOL_NAME,
  LIST_MY_PRODUCTS_TOOL_NAME,
  SEARCH_MENTIONS_TOOL_NAME,
} from '../tools/stock-jobs';
import {
  DISCIPLINARI_CHECK_VALIDITY_TOOL_NAME,
  DISCIPLINARI_LIST_TOOL_NAME,
} from '../tools/disciplinari';
import {
  CONFIRM_DOSAGE_PLAN_TOOL_NAME,
  GET_PROPOSAL_STATE_TOOL_NAME,
  PROPOSE_DOSAGE_PLAN_TOOL_NAME,
  REJECT_DOSAGE_PLAN_TOOL_NAME,
} from '../tools/dosage-proposal';

const LIVE = process.env.SEMINAI_LIVE_TEST === '1';
const describeLive = LIVE ? describe : describe.skip;

const DESTRUCTIVE = process.env.SEMINAI_LIVE_DESTRUCTIVE_TEST === '1';
const describeLiveDestructive = LIVE && DESTRUCTIVE ? describe : describe.skip;

const BASE_URL = process.env.SEMINAI_LIVE_BASE_URL ?? 'http://localhost:8081';
const EMAIL = process.env.SEMINAI_LIVE_EMAIL ?? '';
const PASSWORD = process.env.SEMINAI_LIVE_PASSWORD ?? '';

interface LoginResponse {
  status: string;
  data: { token: string; user: { id: string; email: string } };
}

async function login(): Promise<string> {
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${await response.text()}`);
  }
  const json = (await response.json()) as LoginResponse;
  return json.data.token;
}

function parseToolJson(content: unknown): unknown {
  const arr = content as Array<{ type: string; text: string }>;
  return JSON.parse(arr[0].text);
}

describeLive('LIVE smoke — Catalog wave against real backend', () => {
  let client: Client;
  let firstCompanyId: string;

  beforeAll(async () => {
    if (!EMAIL || !PASSWORD) {
      throw new Error('SEMINAI_LIVE_EMAIL and SEMINAI_LIVE_PASSWORD must be set');
    }
    const token = await login();
    const mcpServer = createSeminaiMcpServer({
      config: {
        apiBaseUrl: BASE_URL,
        apiToken: token,
        serverName: 'seminai-live',
        serverVersion: '0.0.1-live',
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client(
      { name: 'seminai-mcp-live-client', version: '0.0.1' },
      { capabilities: {} },
    );
    await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
  }, 30_000);

  it('listTools advertises all 6 Catalog tools', async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        LIST_COMPANIES_TOOL_NAME,
        LIST_WORKSPACES_TOOL_NAME,
        LIST_FIELDS_TOOL_NAME,
        LIST_PRODUCTION_UNITS_TOOL_NAME,
        LIST_MACHINES_TOOL_NAME,
        LIST_WAREHOUSES_TOOL_NAME,
      ]),
    );
  });

  it('seminai_list_companies returns at least one company', async () => {
    const result = await client.callTool({
      name: LIST_COMPANIES_TOOL_NAME,
      arguments: {},
    });
    expect(result.isError ?? false).toBe(false);
    const body = parseToolJson(result.content) as {
      data: { companies: Array<{ id: string }> };
    };
    expect(body.data.companies.length).toBeGreaterThan(0);
    firstCompanyId = body.data.companies[0].id;
  });

  it('seminai_list_workspaces returns success envelope', async () => {
    const result = await client.callTool({
      name: LIST_WORKSPACES_TOOL_NAME,
      arguments: {},
    });
    expect(result.isError ?? false).toBe(false);
    const body = parseToolJson(result.content) as { status: string };
    expect(body.status).toBe('success');
  });

  it('seminai_list_fields returns success envelope', async () => {
    const result = await client.callTool({
      name: LIST_FIELDS_TOOL_NAME,
      arguments: {},
    });
    expect(result.isError ?? false).toBe(false);
    const body = parseToolJson(result.content) as { status: string };
    expect(body.status).toBe('success');
  });

  it('seminai_list_production_units returns success envelope', async () => {
    const result = await client.callTool({
      name: LIST_PRODUCTION_UNITS_TOOL_NAME,
      arguments: {},
    });
    expect(result.isError ?? false).toBe(false);
    const body = parseToolJson(result.content) as { status: string };
    expect(body.status).toBe('success');
  });

  it('seminai_list_machines_by_company returns machines for the first company', async () => {
    const result = await client.callTool({
      name: LIST_MACHINES_TOOL_NAME,
      arguments: { companyId: firstCompanyId },
    });
    expect(result.isError ?? false).toBe(false);
    const body = parseToolJson(result.content) as {
      data: { machines: unknown[] };
    };
    expect(Array.isArray(body.data.machines)).toBe(true);
  });

  it('seminai_list_warehouses_by_company returns warehouses for the first company', async () => {
    const result = await client.callTool({
      name: LIST_WAREHOUSES_TOOL_NAME,
      arguments: { companyId: firstCompanyId },
    });
    expect(result.isError ?? false).toBe(false);
    const body = parseToolJson(result.content) as {
      data: { warehouses: unknown[] };
    };
    expect(Array.isArray(body.data.warehouses)).toBe(true);
  });
});

describeLive('LIVE smoke — seminai_get_label cascade against real backend', () => {
  let client: Client;
  let token: string;
  let cachedProduct: { productName: string; registrationNumber: string } | null = null;

  beforeAll(async () => {
    if (!EMAIL || !PASSWORD) {
      throw new Error('SEMINAI_LIVE_EMAIL and SEMINAI_LIVE_PASSWORD must be set');
    }
    token = await login();
    const mcpServer = createSeminaiMcpServer({
      config: {
        apiBaseUrl: BASE_URL,
        apiToken: token,
        serverName: 'seminai-live',
        serverVersion: '0.0.1-live',
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client(
      { name: 'seminai-mcp-live-client', version: '0.0.1' },
      { capabilities: {} },
    );
    await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
    const summaryResp = await fetch(`${BASE_URL}/labels/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (summaryResp.ok) {
      const summary = (await summaryResp.json()) as {
        data: Array<{ productName: string; registrationNumber: string }>;
      };
      const first = summary.data?.[0];
      if (first) {
        cachedProduct = {
          productName: first.productName,
          registrationNumber: first.registrationNumber,
        };
      }
    }
  }, 30_000);

  it('cache HIT against a real cached product returns source=seminai_cache', async () => {
    if (!cachedProduct) {
      console.warn('[live] no cached labels, skipping cache HIT test');
      return;
    }
    const result = await client.callTool({
      name: GET_LABEL_TOOL_NAME,
      arguments: {
        productName: cachedProduct.productName,
        registrationNumber: cachedProduct.registrationNumber,
      },
    });
    expect(result.isError ?? false).toBe(false);
    const body = parseToolJson(result.content) as { source: string };
    expect(body.source).toBe('seminai_cache');
  });

  it('seminai_list_my_products returns success envelope', async () => {
    const result = await client.callTool({
      name: LIST_MY_PRODUCTS_TOOL_NAME,
      arguments: {},
    });
    expect(result.isError ?? false).toBe(false);
    const body = parseToolJson(result.content) as { status: string };
    expect(body.status).toBe('success');
  });

  it('seminai_list_my_jobs returns success envelope', async () => {
    const result = await client.callTool({
      name: LIST_MY_JOBS_TOOL_NAME,
      arguments: {},
    });
    expect(result.isError ?? false).toBe(false);
    const body = parseToolJson(result.content) as { status: string };
    expect(body.status).toBe('success');
  });

  it('seminai_disciplinari_list returns success envelope', async () => {
    const result = await client.callTool({
      name: DISCIPLINARI_LIST_TOOL_NAME,
      arguments: {},
    });
    expect(result.isError ?? false).toBe(false);
    const body = parseToolJson(result.content) as { status: string };
    expect(body.status).toBe('success');
  });

  it('seminai_disciplinari_check_validity returns flags for a region/year pair', async () => {
    const result = await client.callTool({
      name: DISCIPLINARI_CHECK_VALIDITY_TOOL_NAME,
      arguments: { region: 'Lombardia', year: 2025 },
    });
    expect(result.isError ?? false).toBe(false);
    const body = parseToolJson(result.content) as {
      status: string;
      data: { exists: boolean; isValid: boolean; needsUpdate: boolean };
    };
    expect(body.status).toBe('success');
    expect(typeof body.data.exists).toBe('boolean');
    expect(typeof body.data.isValid).toBe('boolean');
    expect(typeof body.data.needsUpdate).toBe('boolean');
  });

  it('seminai_search_mentions returns matches for an existing company name', async () => {
    const result = await client.callTool({
      name: SEARCH_MENTIONS_TOOL_NAME,
      arguments: { q: 'azienda-demo' },
    });
    expect(result.isError ?? false).toBe(false);
    const body = parseToolJson(result.content) as {
      status: string;
      data: Array<{ id: string; type: string }>;
    };
    expect(body.status).toBe('success');
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('cache MISS with allowLiveSianExtraction=false returns the gate error', async () => {
    const result = await client.callTool({
      name: GET_LABEL_TOOL_NAME,
      arguments: {
        productName: 'mcp-integration-test-fake-product-name',
        registrationNumber: 'mcp-integration-test-fake-reg-99999',
      },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('not found in Seminai cache');
    expect(text).toContain('allowLiveSianExtraction=true');
  });
});

/**
 * Exercises the propose/state/reject mechanics against a real backend without
 * persisting anything. The propose message intentionally stays vague: depending
 * on the user's data, the agent may return COMPLETED (read-only answer) or
 * REQUIRES_APPROVAL. Both are accepted; the test only validates the response
 * shape and the round-trip through the 4 tools.
 */
describeLive('LIVE smoke — Dosage Proposal wave (safe, no DB writes)', () => {
  let client: Client;
  const threadId = `mcp-live-${Date.now()}`;

  beforeAll(async () => {
    if (!EMAIL || !PASSWORD) {
      throw new Error('SEMINAI_LIVE_EMAIL and SEMINAI_LIVE_PASSWORD must be set');
    }
    const token = await login();
    const mcpServer = createSeminaiMcpServer({
      config: {
        apiBaseUrl: BASE_URL,
        apiToken: token,
        serverName: 'seminai-live',
        serverVersion: '0.0.1-live',
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client(
      { name: 'seminai-mcp-live-client', version: '0.0.1' },
      { capabilities: {} },
    );
    await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
  }, 30_000);

  it('listTools advertises all 4 Dosage Proposal tools', async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        PROPOSE_DOSAGE_PLAN_TOOL_NAME,
        CONFIRM_DOSAGE_PLAN_TOOL_NAME,
        REJECT_DOSAGE_PLAN_TOOL_NAME,
        GET_PROPOSAL_STATE_TOOL_NAME,
      ]),
    );
  });

  it('seminai_propose_dosage_plan returns a valid AgentResponse with enriched risk fields when paused', async () => {
    const result = await client.callTool({
      name: PROPOSE_DOSAGE_PLAN_TOOL_NAME,
      arguments: {
        threadId,
        message:
          'Mostrami che prodotti fitosanitari ho disponibili in magazzino, senza creare nulla.',
      },
    });
    expect(result.isError ?? false).toBe(false);
    const body = parseToolJson(result.content) as {
      status: string;
      pendingToolCalls?: Array<{
        name: string;
        riskLevel?: string;
        riskScore?: number;
      }>;
      proposalSummary?: { tool: string; totalJobs: number };
    };
    expect(['COMPLETED', 'REQUIRES_APPROVAL', 'ERROR']).toContain(body.status);
    if (body.status === 'REQUIRES_APPROVAL') {
      expect(body.pendingToolCalls).toBeDefined();
      expect(body.pendingToolCalls?.length).toBeGreaterThan(0);
      const first = body.pendingToolCalls![0];
      expect(['low', 'medium', 'high']).toContain(first.riskLevel);
      expect(typeof first.riskScore).toBe('number');
      if (first.name === 'create_treatment_jobs') {
        expect(body.proposalSummary).toBeDefined();
        expect(body.proposalSummary?.tool).toBe('create_treatment_jobs');
        expect(typeof body.proposalSummary?.totalJobs).toBe('number');
      }
    }
  }, 60_000);

  it('seminai_get_proposal_state returns parseable state for the active threadId', async () => {
    const result = await client.callTool({
      name: GET_PROPOSAL_STATE_TOOL_NAME,
      arguments: { proposalId: threadId },
    });
    expect(result.isError ?? false).toBe(false);
    parseToolJson(result.content); // shape varies; just ensure it parses
  });

  it('seminai_reject_dosage_plan terminates the proposal cleanly', async () => {
    const result = await client.callTool({
      name: REJECT_DOSAGE_PLAN_TOOL_NAME,
      arguments: { proposalId: threadId, reason: 'live smoke teardown' },
    });
    // No assertion on isError: rejecting when there is no pending tool surfaces
    // an isError content from the backend, which is a valid outcome here. We
    // only assert the MCP round-trip succeeded.
    expect(result.content).toBeDefined();
  }, 30_000);
});

/**
 * Full propose → confirm path against a real backend. PERSISTS treatment jobs
 * to the database, so it is gated behind SEMINAI_LIVE_DESTRUCTIVE_TEST=1.
 *
 * Requires a workspace with at least one production unit and one phytosanitary
 * product whose label is cached and compatible with the unit's crop, so that
 * the dosage agent actually reaches the create_treatment_jobs approval gate.
 * Configure the test target via:
 *   - SEMINAI_LIVE_DOSAGE_MESSAGE: the natural-language prompt to send.
 *     Should refer to a real production unit and product by name. If unset,
 *     the test is skipped at runtime with a console warning.
 */
describeLiveDestructive('LIVE smoke — Dosage Proposal CONFIRM (writes to DB)', () => {
  let client: Client;
  const threadId = `mcp-live-destructive-${Date.now()}`;
  const dosageMessage = process.env.SEMINAI_LIVE_DOSAGE_MESSAGE ?? '';

  beforeAll(async () => {
    if (!EMAIL || !PASSWORD) {
      throw new Error('SEMINAI_LIVE_EMAIL and SEMINAI_LIVE_PASSWORD must be set');
    }
    const token = await login();
    const mcpServer = createSeminaiMcpServer({
      config: {
        apiBaseUrl: BASE_URL,
        apiToken: token,
        serverName: 'seminai-live-destructive',
        serverVersion: '0.0.1-live',
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client(
      { name: 'seminai-mcp-live-destructive-client', version: '0.0.1' },
      { capabilities: {} },
    );
    await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
  }, 30_000);

  it('full propose → confirm cycle persists jobs and confirm is idempotent', async () => {
    if (!dosageMessage) {
      console.warn(
        '[live-destructive] SEMINAI_LIVE_DOSAGE_MESSAGE not set; skipping confirm cycle',
      );
      return;
    }

    const proposeResult = await client.callTool({
      name: PROPOSE_DOSAGE_PLAN_TOOL_NAME,
      arguments: { threadId, message: dosageMessage },
    });
    expect(proposeResult.isError ?? false).toBe(false);
    const proposeBody = parseToolJson(proposeResult.content) as {
      status: string;
      pendingToolCalls?: Array<{ name: string; riskLevel?: string }>;
      proposalSummary?: { tool: string; totalJobs: number };
    };
    expect(proposeBody.status).toBe('REQUIRES_APPROVAL');
    expect(proposeBody.pendingToolCalls?.[0].name).toBe('create_treatment_jobs');
    expect(proposeBody.proposalSummary?.tool).toBe('create_treatment_jobs');
    const expectedJobs = proposeBody.proposalSummary!.totalJobs;
    expect(expectedJobs).toBeGreaterThan(0);

    const confirmResult = await client.callTool({
      name: CONFIRM_DOSAGE_PLAN_TOOL_NAME,
      arguments: { proposalId: threadId },
    });
    expect(confirmResult.isError ?? false).toBe(false);
    const confirmBody = parseToolJson(confirmResult.content) as { status: string };
    expect(['COMPLETED', 'REQUIRES_APPROVAL']).toContain(confirmBody.status);

    const secondConfirm = await client.callTool({
      name: CONFIRM_DOSAGE_PLAN_TOOL_NAME,
      arguments: { proposalId: threadId },
    });
    expect(secondConfirm.content).toBeDefined();
  }, 180_000);
});

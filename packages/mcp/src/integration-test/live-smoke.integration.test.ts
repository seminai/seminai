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
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
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
import { createLiveClient, describeLive, LIVE_BASE_URL, parseToolJson } from './live-smoke-harness';

describeLive('LIVE smoke — Catalog wave against real backend', () => {
  let client: Client;
  let firstCompanyId: string;

  beforeAll(async () => {
    ({ client } = await createLiveClient());
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
    ({ client, token } = await createLiveClient());
    const summaryResp = await fetch(`${LIVE_BASE_URL}/labels/summary`, {
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
      arguments: { region: 'Lombardia', year: new Date().getFullYear() },
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

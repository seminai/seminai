import { checkAiSettings } from './check-ai-settings';
import { checkFarmAtomic } from './check-farm-atomic';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DesktopRuntime } = require('../../packages/desktop/src/runtime.cjs');
const dataDir = await mkdtemp(path.join(tmpdir(), 'seminai-farm-test-'));
const runtime = new DesktopRuntime({
  dataDir,
  runtimeDir: path.resolve('..'),
  onLog: (message: string) => process.stdout.write(message),
});
let close: (() => Promise<void>) | undefined;
try {
  const state = await runtime.initialize();
  Object.assign(process.env, runtime.env);
  const { prisma } = await import('../src/infrastructure/repositories/Prisma');
  const { closeDesktopPool } = await import('../src/infrastructure/desktop/database');
  const { closePgBoss } = await import('../src/infrastructure/queue/pg-boss-runtime');
  close = async () => {
    await closePgBoss();
    await closeDesktopPool();
    await prisma.$disconnect();
  };
  const request = async (url: string, method = 'GET', body?: unknown, token?: string) => {
    const response = await fetch(`${state.url}${url}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    return { status: response.status, data: payload?.data, payload };
  };
  const setup = await request('/setup/complete', 'POST', {
    admin: {
      name: 'Synthetic admin',
      email: 'admin@example.test',
      password: 'Synthetic-Password-123',
    },
    access: { mode: 'lan' },
  });
  assert.equal(setup.status, 201, JSON.stringify(setup.payload));
  const token = setup.data.token as string;
  const userId = setup.data.user.id as string;
  const company = await prisma.company.create({
    data: {
      name: 'Synthetic Farm',
      vatNumber: 'TEST',
      fiscalCode: 'TEST',
      companyUsers: { create: { userId, role: 'ADMIN' } },
    },
  });
  const warehouse = await prisma.warehouse.create({
    data: {
      name: 'Synthetic Store',
      address: 'Test',
      sezione: '',
      foglio: '',
      particella: '',
      companyId: company.id,
    },
  });
  const product = await prisma.product.create({
    data: {
      name: 'Synthetic Product',
      sku: 'SYNTHETIC',
      type: 'Test',
      warehouseId: warehouse.id,
      category: 'OTHER',
    },
  });
  const operation = {
    companyId: company.id,
    date: '2026-10-08T10:00:00Z',
    reason: 'Synthetic test',
    movements: [{ productId: product.id, type: 'IN', quantity: 10, unit: 'kg', price: 0 }],
  };
  const create = async (input = operation, connectionToken = token) =>
    request(
      '/farm/operations',
      'POST',
      { operation: input, idempotencyKey: randomUUID() },
      connectionToken,
    );
  const firstKey = randomUUID();
  const first = await request(
    '/farm/operations',
    'POST',
    { operation, idempotencyKey: firstKey },
    token,
  );
  assert.equal(first.status, 201, JSON.stringify(first.payload));
  const duplicate = await request(
    '/farm/operations',
    'POST',
    { operation, idempotencyKey: firstKey },
    token,
  );
  assert.equal(duplicate.data.id, first.data.id);
  assert.equal(await prisma.stock.count(), 0);
  const approve = (proposal: { id: string; version: number }, negativeReason?: string) =>
    request(
      `/farm/operations/${proposal.id}/review`,
      'POST',
      { version: proposal.version, decision: 'approve', negativeReason },
      token,
    );
  assert.equal((await approve(first.data)).status, 200);
  assert.equal((await approve(first.data)).status, 200);
  assert.equal(await prisma.stock.count(), 1);
  const pending = await create();
  const competing = await create();
  await approve(competing.data);
  const stale = await approve(pending.data);
  assert.equal(stale.status, 409);
  assert.equal(stale.data.operation.version, 2);
  assert.equal((await approve(stale.data.operation)).status, 200);
  const negative = await create({
    ...operation,
    movements: [{ ...operation.movements[0], type: 'OUT', quantity: 100 }],
  });
  assert.equal((await approve(negative.data)).status, 409);
  assert.equal((await approve(negative.data, 'Synthetic negative balance authorized')).status, 200);
  const connection = await request(
    '/farm/connections',
    'POST',
    { companyId: company.id, name: 'Synthetic MCP' },
    token,
  );
  const scoped = connection.data.token as string;
  assert.equal((await request('/mcp-api/identity', 'GET', undefined, scoped)).status, 200);
  assert.equal((await create(operation, scoped)).status, 401);
  const mcpInput = { operation, idempotencyKey: randomUUID() };
  const proposed = await request('/mcp-api/proposals', 'POST', mcpInput, scoped);
  assert.equal(proposed.status, 201);
  assert.equal(
    (
      await request(
        `/farm/operations/${proposed.data.id}/review`,
        'POST',
        { version: 1, decision: 'approve' },
        scoped,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await request(
        '/mcp-api/proposals',
        'POST',
        { ...mcpInput, operation: { ...operation, companyId: 'other-company' } },
        scoped,
      )
    ).status,
    403,
  );
  const mcpClient = new McpClient({ name: 'synthetic-client', version: '1' });
  await mcpClient.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${runtime.config.mcpPort}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${scoped}` } },
    }),
  );
  assert.equal(
    (await mcpClient.listTools()).tools.some((tool) => /approve|confirm/.test(tool.name)),
    false,
  );
  const toolResult = await mcpClient.callTool({
    name: 'seminai_propose_operation',
    arguments: { operation, idempotencyKey: randomUUID() },
  });
  const content = toolResult.content as Array<{ type: string; text: string }>;
  const throughMcp = JSON.parse(content[0].text).data;
  assert.equal(throughMcp.status, 'pending');
  const beforeConfirmation = await prisma.stock.count();
  assert.equal((await approve(throughMcp, 'Synthetic MCP confirmation')).status, 200);
  assert.equal(await prisma.stock.count(), beforeConfirmation + 1);
  const confirmedTool = await mcpClient.callTool({
    name: 'seminai_get_operation_status',
    arguments: { id: throughMcp.id },
  });
  assert.equal(
    JSON.parse((confirmedTool.content as Array<{ text: string }>)[0].text).data.status,
    'approved',
  );
  await mcpClient.close();
  console.log(
    'PASS: real Streamable HTTP MCP proposal, in-app API approval, single stock row and status',
  );
  await request(`/farm/connections/${connection.data.id}`, 'DELETE', undefined, token);
  assert.equal((await request('/mcp-api/identity', 'GET', undefined, scoped)).status, 401);
  assert.equal((await approve(proposed.data)).status, 409);
  const rejected = await create();
  await request(
    `/farm/operations/${rejected.data.id}/review`,
    'POST',
    { version: 1, decision: 'reject' },
    token,
  );
  assert.equal((await approve(rejected.data)).data.operation.status, 'rejected');
  await checkFarmAtomic(prisma, state.url, token, company.id, product.id);
  await checkAiSettings(prisma, state.url, token);
  console.log(
    'PASS: offline setup, idempotency, approval, stale balances, negative reason, scoped MCP, cross-company, revocation, rejection',
  );
  const { PostgresQueue } = await import('../src/infrastructure/queue/postgres-queue');
  const { PostgresWorker } = await import('../src/infrastructure/queue/postgres-worker');
  const queue = new PostgresQueue('desktop-smoke');
  const queued = await queue.add('persisted', { value: 7 });
  await closePgBoss(); // An enqueued job must survive a runtime restart.
  let attempts = 0;
  const worker = new PostgresWorker('desktop-smoke', async (job) => {
    attempts++;
    await job.updateProgress(75);
    if (attempts === 1) throw new Error('synthetic retry');
    return { ok: true };
  });
  for (let index = 0; index < 80; index++) {
    if ((await (await queue.getJob(queued.id))?.getState()) === 'completed') break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const completed = await queue.getJob(queued.id);
  assert.equal(await completed?.getState(), 'completed');
  assert.deepEqual(completed?.returnvalue, { ok: true });
  assert.equal(completed?.progress, 75);
  assert.equal(attempts, 2);
  await worker.close();
  console.log('PASS: pg-boss restart, retry, progress and result');
  await close();
  const { exportPortable } = require('../../packages/desktop/src/portable-data.cjs');
  const { importPortable } = require('../../packages/desktop/src/import-portable.cjs');
  const portable = path.join(dataDir, 'transfer.seminai');
  await runtime.stopApi();
  await exportPortable({ databaseUrl: runtime.env.DATABASE_URL, dataDir, destination: portable });
  await runtime.startApi();
  await importPortable(runtime, portable);
  assert.equal(
    (await request('/farm/operations?companyId=' + company.id, 'GET', undefined, token)).status,
    200,
  );
  assert.equal((await request('/mcp-api/identity', 'GET', undefined, scoped)).status, 401);
  console.log('PASS: portable export/import, restored login, retained MCP revocation');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await close?.();
  await runtime.stop();
  await rm(dataDir, { recursive: true, force: true });
  if (process.exitCode) process.exit(1);
}

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';

async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}
const port = await freePort();
const mcpPort = await freePort();
const directory = await mkdtemp(path.join(tmpdir(), 'seminai-web-check-'));
const base = `http://127.0.0.1:${port}`;
const environment = {
  ...process.env, COMPOSE_PROJECT_NAME: `seminai-web-check-${process.pid}`,
  SEMINAI_IMAGE: process.env.SEMINAI_IMAGE || 'seminai:web-candidate',
  SEMINAI_DATA_DIR: directory, SEMINAI_PORT: String(port), SEMINAI_BIND_HOST: '127.0.0.1',
  PUBLIC_BASE_URL: base, ACCESS_MODE: 'lan',
  SEMINAI_MCP_PORT: String(mcpPort), MCP_PUBLIC_BASE_URL: `http://127.0.0.1:${mcpPort}`,
};

async function capture(command, args) {
  return await new Promise((resolve, reject) => {
    let output = '';
    const child = spawn(command, args, { env: environment, stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout.on('data', (data) => { output += data; process.stdout.write(data); });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve(output) : reject(new Error(`${command} failed: ${args.join(' ')}`)));
  });
}
const compose = (...args) => capture('docker', ['compose', '-f', 'compose.yaml', ...args]);
const maintenance = (script, ...args) => capture('sh', [`scripts/deploy/${script}.sh`, ...args]);

let token;
async function request(route, method = 'GET', body) {
  const response = await fetch(`${base}${route}`, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  assert.ok(response.ok, `${method} ${route}: ${response.status} ${JSON.stringify(result)}`);
  return result.data ?? result;
}

try {
  await compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '240');
  assert.match(await fetch(base).then((response) => response.text()), /\/assets\//);
  assert.equal((await request('/config/public')).ai.enabled, false);
  const setup = await request('/setup/complete', 'POST', {
    admin: { name: 'Synthetic web admin', email: 'web@example.test', password: 'Synthetic-Password-123' },
    access: { mode: 'lan' },
  });
  token = setup.token;
  assert.equal((await request('/config/public')).ai.enabled, false);
  const companyResult = await request('/companies', 'POST', { name: 'Synthetic web farm', vatNumber: '00000000000', fiscalCode: '' });
  const company = companyResult.company ?? companyResult;
  const warehouseResult = await request('/warehouses', 'POST', {
    name: 'Synthetic warehouse', address: 'Test', sezione: '', foglio: '', particella: '', companyId: company.id,
  });
  const warehouse = warehouseResult.warehouse ?? warehouseResult;
  const productResult = await request('/products', 'POST', {
    name: 'Synthetic fertilizer', sku: 'WEB-TEST', type: 'Test', category: 'FERTILIZER', warehouseId: warehouse.id, companyId: company.id,
  });
  const product = productResult.product ?? productResult;
  const proposal = await request('/farm/operations', 'POST', {
    idempotencyKey: randomUUID(), operation: {
      companyId: company.id, date: '2026-10-08T10:00:00Z', reason: 'Synthetic Docker acceptance',
      movements: [{ productId: product.id, type: 'IN', quantity: 10, unit: 'kg', price: 0 }],
    },
  });
  const approved = await request(`/farm/operations/${proposal.id}/review`, 'POST', { version: proposal.version, decision: 'approve' });
  assert.equal(approved.operation.status, 'approved');
  await compose('down');
  await compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '240');
  assert.equal((await request('/setup/status')).completed, true);
  assert.equal((await request('/config/public')).ai.enabled, false);
  const readOperation = async () => (await request(`/farm/operations?companyId=${company.id}`)).find((row) => row.id === proposal.id);
  assert.equal((await readOperation()).status, 'approved');
  await compose('exec', '-T', 'app', 'node', '-e', "const f=require('fs');f.mkdirSync('prisma/migrations/20991008000000_web_smoke');f.writeFileSync('prisma/migrations/20991008000000_web_smoke/migration.sql','CREATE TABLE \"WebMigrationProbe\" (id text PRIMARY KEY);');");
  await compose('restart', 'app');
  await compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '240');
  await compose('exec', '-T', 'app', 'node', '-e', "const f=require('fs');const files=f.readdirSync('/data/backups').filter(n=>n.endsWith('.tar.gz'));require('assert').equal(files.length,1);const manifest=JSON.parse(require('child_process').execFileSync('tar',['-xOzf','/data/backups/'+files[0],'manifest.json'],{encoding:'utf8'}));require('assert').equal(manifest.reason,'before-migration');");
  await compose('--profile', 'mcp', 'up', '-d', '--no-build', 'mcp');
  const archive = (await maintenance('backup')).trim().split('\n').at(-1);
  assert.match(archive, /^\/data\/backups\/seminai-[\w.-]+\.tar\.gz$/);
  await compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '240');
  const later = await request('/farm/operations', 'POST', { operation: proposal.payload, idempotencyKey: randomUUID() });
  await request(`/farm/operations/${later.id}/review`, 'POST', { version: later.version, decision: 'approve' });
  assert.equal((await request(`/farm/operations?companyId=${company.id}`)).length, 2);
  const mcpBeforeRestore = JSON.parse(await compose('--profile', 'mcp', 'ps', '--format', 'json', 'mcp')).ID;
  const startedBeforeRestore = await capture('docker', ['inspect', '--format', '{{.State.StartedAt}}', mcpBeforeRestore]);
  await maintenance('restore', archive);
  assert.equal((await readOperation()).status, 'approved');
  assert.equal((await request(`/farm/operations?companyId=${company.id}`)).length, 1);
  const mcpAfterRestore = JSON.parse(await compose('--profile', 'mcp', 'ps', '--format', 'json', 'mcp'));
  assert.equal(mcpAfterRestore.ID, mcpBeforeRestore);
  assert.equal(mcpAfterRestore.State, 'running', 'Restore must restart MCP to reload restored authorization state');
  assert.notEqual(await capture('docker', ['inspect', '--format', '{{.State.StartedAt}}', mcpBeforeRestore]), startedBeforeRestore);
  let metadata;
  for (let attempt = 0; attempt < 30; attempt++) {
    metadata = await fetch(`http://127.0.0.1:${mcpPort}/.well-known/oauth-authorization-server`).then((r) => r.json()).catch(() => undefined);
    if (metadata) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(metadata?.issuer, environment.MCP_PUBLIC_BASE_URL);
  assert.equal((await fetch(`http://127.0.0.1:${mcpPort}/mcp`)).status, 401);
  console.log('PASS: Docker web, no-AI setup, manual stock, recreation, pre-migration backup, restore of changed data and optional MCP authentication.');
} finally {
  await compose('--profile', 'mcp', 'down', '--remove-orphans').catch(() => {});
  // PostgreSQL creates files as its container user; remove only this test's bind mounts.
  await new Promise((resolve) => {
    const child = spawn('docker', ['run', '--rm', '--mount', `type=bind,source=${directory},target=/cleanup`,
      '--entrypoint', 'node', environment.SEMINAI_IMAGE, '-e',
      "require('fs').readdirSync('/cleanup').forEach(name=>require('fs').rmSync('/cleanup/'+name,{recursive:true,force:true}))"], { stdio: 'inherit' });
    child.on('exit', resolve); child.on('error', resolve);
  });
  await rm(directory, { recursive: true, force: true }).catch(() => {});
}

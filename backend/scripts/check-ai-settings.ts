import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PrismaClient } from '@prisma/client';

/** Only an in-process synthetic provider is contacted; no cloud credentials are used. */
export async function checkAiSettings(prisma: PrismaClient, base: string, token: string) {
  let calls = 0;
  const provider = createServer((request, response) => {
    calls++;
    assert.equal(request.url, '/v1/models');
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ data: [{ id: 'synthetic-chat' }] }));
  });
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${(provider.address() as AddressInfo).port}/v1`;
  const request = async (route: string, method = 'GET', body?: unknown) => {
    const response = await fetch(base + route, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, payload: await response.json() };
  };
  try {
    assert.equal((await request('/settings/me')).status, 200);
    const configured = await request('/settings/ai', 'PUT', { enabled: true, provider: 'openai-compatible', baseUrl: endpoint, model: 'synthetic-chat', apiKey: 'synthetic-test-key' });
    assert.equal(configured.status, 200, JSON.stringify(configured.payload));
    assert.equal(JSON.stringify(configured.payload).includes('synthetic-test-key'), false);
    assert.equal(configured.payload.data.hasApiKey, true);
    assert.deepEqual(configured.payload.data.capabilities, { enabled: true, chat: true, vision: false, audio: false, embeddings: false });
    assert.equal(calls, 0, 'Saving configuration must not probe a provider');
    assert.equal((await request('/settings/ai/test', 'POST')).payload.data.reachable, true);
    assert.equal(calls, 1);
    const secret = await prisma.instanceSetting.findUniqueOrThrow({ where: { key: 'llm.apiKey' } });
    assert.equal(secret.valueEnc.includes('synthetic-test-key'), false);
    const changed = await request('/settings/ai', 'PUT', { enabled: true, provider: 'ollama', model: 'synthetic-local' });
    assert.equal(changed.status, 200);
    assert.equal(changed.payload.data.hasApiKey, false);
    assert.equal(changed.payload.data.baseUrl, 'http://127.0.0.1:11434');
    const disabled = await request('/settings/ai', 'PUT', { enabled: false, provider: 'ollama', model: '' });
    assert.equal(disabled.status, 200);
    assert.equal((await request('/settings/ai/test', 'POST')).payload.data.reachable, false);
    assert.equal(calls, 1);
    assert.equal((await request('/agent-chat')).status, 409);
    assert.equal((await request('/farm/companies')).status, 200);
    console.log('PASS: AI opt-in, encrypted credentials, explicit probe, provider change clears key/endpoint, disabled AI leaves manual APIs available');
  } finally { await new Promise<void>((resolve, reject) => provider.close(error => error ? reject(error) : resolve())); }
}

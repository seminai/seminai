#!/usr/bin/env node
const base = (process.env.E2E_BASE_URL || 'http://127.0.0.1:8081').replace(/\/$/, '');

async function get(path) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response;
}

try {
  const health = await (await get('/health')).json();
  if (health.status !== 'ok' && health.status !== 'success') {
    throw new Error(`health payload unexpected: ${JSON.stringify(health)}`);
  }
  const config = await (await get('/config/public')).json();
  if (config?.status !== 'success' || !config.data) {
    throw new Error('GET /config/public did not succeed');
  }
  const detect = await (await get('/llm/providers/detect')).json();
  if (!Array.isArray(detect?.data?.providers)) {
    throw new Error('GET /llm/providers/detect did not list providers');
  }
  const setup = await get('/setup');
  const html = await setup.text();
  if (!html.toLowerCase().includes('html')) {
    throw new Error('GET /setup did not return HTML');
  }
  console.log(`e2e public smoke passed against ${base}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
    console.error(`e2e skipped: nothing is listening at ${base}`);
    process.exit(2);
  }
  console.error(message);
  process.exit(1);
}

const { mkdtemp, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const runtimeDir = process.env.SEMINAI_RUNTIME_DIR || path.resolve(__dirname, '../../..');
const { DesktopRuntime } = require(
  process.env.SEMINAI_RUNTIME_DIR
    ? path.join(runtimeDir, 'desktop/runtime.cjs')
    : '../src/runtime.cjs',
);
(async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'seminai-desktop-test-'));
  const runtime = new DesktopRuntime({
    dataDir,
    runtimeDir,
    onLog: (message) => process.stdout.write(message),
  });
  try {
    const state = await runtime.initialize();
    const page = await fetch(state.url).then((response) => response.text());
    assert.ok(
      page.includes('/assets/'),
      'The desktop root must serve the React application, not the backend landing page',
    );
    const config = await fetch(`${state.url}/config/public`).then((r) => r.json());
    assert.equal(config.ai?.enabled ?? config.data?.ai?.enabled, false);
    const client = runtime.pg.getPgClient('seminai', '127.0.0.1');
    await client.connect();
    await client.query('CREATE TABLE "DesktopSmoke" (value text)');
    await client.query('INSERT INTO "DesktopSmoke" VALUES ($1)', ['record-before-restart']);
    await client.end();
    await runtime.stop();
    await runtime.initialize();
    const after = runtime.pg.getPgClient('seminai', '127.0.0.1');
    await after.connect();
    assert.equal(
      (await after.query('SELECT value FROM "DesktopSmoke"')).rows[0].value,
      'record-before-restart',
    );
    await after.end();
    await runtime.snapshot(path.join(dataDir, 'backups', 'test.zip'));
    console.log('PASS: standalone boot, AI disabled, PostgreSQL persistence, backup');
  } finally {
    await runtime.stop();
    await rm(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

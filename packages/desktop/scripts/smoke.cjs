const { mkdtemp, rm, readdir, readFile, readlink } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const runtimeDir = process.env.SEMINAI_RUNTIME_DIR || path.resolve(__dirname, '../../..');
const { DesktopRuntime } = require(
  process.env.SEMINAI_RUNTIME_DIR
    ? path.join(runtimeDir, 'desktop/runtime.cjs')
    : '../src/runtime.cjs',
);
async function engineFiles() {
  const directory = path.dirname(
    require.resolve('@prisma/engines/package.json', {
      paths: [path.join(runtimeDir, 'backend')],
    }),
  );
  const result = {};
  for (const name of await readdir(directory)) {
    if (name.startsWith('schema-engine-'))
      result[name] = createHash('sha256')
        .update(await readFile(path.join(directory, name)))
        .digest('hex');
  }
  return result;
}
async function cacheFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory())
      result.push(...(await cacheFiles(file)).map((name) => `${entry.name}/${name}`));
    else result.push(entry.name + (entry.isSymbolicLink() ? ` -> ${await readlink(file)}` : ''));
  }
  return result.sort();
}
(async () => {
  const beforeEngines = await engineFiles();
  const cache = path.join(runtimeDir, 'backend/node_modules/.cache');
  const beforeCache = await cacheFiles(cache);
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
    assert.deepEqual(
      await engineFiles(),
      beforeEngines,
      'Boot must not replace the bundled/signed Prisma engine',
    );
    assert.deepEqual(
      await cacheFiles(cache),
      beforeCache,
      'Boot must not write a cache inside the app',
    );
    console.log('PASS: standalone boot, AI disabled, PostgreSQL persistence, backup');
  } finally {
    await runtime.stop();
    await rm(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const root = path.resolve(__dirname, '../../..');
const runtimeDir = process.env.SEMINAI_RUNTIME_DIR || root;
const workerPath = process.env.SEMINAI_RUNTIME_DIR
  ? path.join(runtimeDir, 'desktop/runtime-worker.cjs')
  : path.join(root, 'packages/desktop/src/runtime-worker.cjs');
let worker;
let output = '';
async function command(action, value) {
  const id = require('node:crypto').randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Supervisor timeout: ${action}`));
    }, 120000);
    const message = (result) => {
      if (result.id !== id) return;
      cleanup();
      result.error ? reject(new Error(result.error)) : resolve(result.result);
    };
    const exited = () => {
      cleanup();
      reject(new Error('Supervisor exited'));
    };
    function cleanup() {
      clearTimeout(timeout);
      worker.off('message', message);
      worker.off('exit', exited);
    }
    worker.on('message', message);
    worker.once('exit', exited);
    worker.send({ id, command: action, value });
  });
}
(async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'seminai-recovery-check-'));
  const dataDir = path.join(folder, 'data');
  const start = async () => {
    worker = spawn(process.execPath, [workerPath], {
      env: { ...process.env, SEMINAI_RUNTIME_DIR: runtimeDir, SEMINAI_DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    for (const stream of [worker.stdout, worker.stderr])
      stream.on('data', (value) => {
        output = (output + value).slice(-12000);
      });
    return command('start');
  };
  const query = async (sql) => {
    const config = JSON.parse(await fs.readFile(path.join(dataDir, 'desktop.json'), 'utf8'));
    const client = new Client({
      host: '127.0.0.1',
      port: config.pgPort,
      user: 'seminai',
      password: config.password,
      database: 'seminai',
    });
    await client.connect();
    try {
      return await client.query(sql);
    } finally {
      await client.end();
    }
  };
  try {
    await start();
    await query('CREATE TABLE "RecoveryMarker" (value text)');
    await query('INSERT INTO "RecoveryMarker" VALUES (\'before-backup\')');
    const backup = path.join(folder, 'snapshot.zip');
    await command('backup', backup);
    await query('UPDATE "RecoveryMarker" SET value=\'after-backup\'');
    await command('restore', backup);
    assert.equal(
      (await query('SELECT value FROM "RecoveryMarker"')).rows[0].value,
      'before-backup',
    );
    const exited = once(worker, 'exit');
    worker.kill('SIGKILL');
    await exited;
    await start();
    assert.equal(
      (await query('SELECT value FROM "RecoveryMarker"')).rows[0].value,
      'before-backup',
    );
    console.log('PASS: physical backup/restore and recovery after abrupt supervisor termination');
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    if (worker?.connected) {
      await command('stop');
      worker.disconnect();
      await once(worker, 'exit');
    }
    await fs.rm(folder, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

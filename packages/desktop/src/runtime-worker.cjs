process.umask(0o077);
const path = require('node:path');
const fs = require('node:fs/promises');
const { DesktopRuntime } = require('./runtime.cjs');
const runtime = new DesktopRuntime({
  dataDir: process.env.SEMINAI_DATA_DIR,
  runtimeDir: process.env.SEMINAI_RUNTIME_DIR,
  onLog: (message) => process.stdout.write(message),
  onReconfigure: () => {
    pendingRestart = true;
    void restartIfIdle();
  },
});
let busy = false;
let pendingRestart = false;
async function restartIfIdle() {
  if (busy || !pendingRestart) return;
  busy = true;
  pendingRestart = false;
  try {
    await runtime.stopApi();
    await runtime.startApi();
  } catch {
    process.stderr.write('Riavvio configurazione AI non riuscito\n');
  } finally {
    busy = false;
  }
}
process.on('message', async ({ id, command, value }) => {
  if (busy) return process.send({ id, error: 'Un’operazione è già in corso' });
  busy = true;
  try {
    let result;
    if (command === 'start') result = await runtime.initialize();
    else if (command === 'stop') {
      pendingRestart = false;
      await runtime.stop();
      result = true;
    } else if (command === 'lan') result = await runtime.setLan(value);
    else if (command === 'backup') {
      await runtime.snapshot(value);
      result = true;
    } else if (command === 'export-portable') {
      const { exportPortable } = require('./portable-data.cjs');
      await runtime.stopApi();
      try {
        await exportPortable({
          databaseUrl: runtime.env.DATABASE_URL,
          dataDir: runtime.dataDir,
          destination: value,
        });
        result = true;
      } finally {
        await runtime.startApi();
      }
    } else if (command === 'import-portable') {
      const { importPortable } = require('./import-portable.cjs');
      await importPortable(runtime, value);
      result = runtime.state();
    } else if (command === 'restore') {
      const { validateSnapshot } = require('./snapshots.cjs');
      const zip = await validateSnapshot(value);
      await runtime.snapshot(
        path.join(runtime.dataDir, 'backups', `before-restore-${Date.now()}.zip`),
      );
      await runtime.stop();
      const stage = path.join(runtime.dataDir, 'restore-staging');
      await fs.rm(stage, { recursive: true, force: true });
      zip.extractAllTo(stage, true);
      // Keep the current data as a recoverable directory until the next successful launch.
      const previous = `${runtime.dataDir}-before-restore-${Date.now()}`;
      await fs.rename(runtime.dataDir, previous);
      await fs.rename(path.join(previous, 'restore-staging'), runtime.dataDir);
      result = await runtime.initialize();
    } else throw new Error('Comando non supportato');
    process.send({ id, result });
  } catch (error) {
    process.send({ id, error: error instanceof Error ? error.message : 'Operazione non riuscita' });
  } finally {
    busy = false;
    await restartIfIdle();
  }
});
process.on('disconnect', () => {
  void runtime.stop().finally(() => process.exit());
});

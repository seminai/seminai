const path = require('node:path');
const fs = require('node:fs/promises');
const { run } = require('./runtime.cjs');
const controlPath = (runtime) =>
  path.join(
    path.dirname(runtime.binaries.postgres),
    process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl',
  );
/** pg_ctl also starts PostgreSQL with a restricted token when Windows has an elevated parent. */
async function startDatabase(runtime) {
  const directory = path.join(runtime.dataDir, 'postgres');
  const logs = path.join(runtime.dataDir, 'logs');
  await fs.mkdir(logs, { recursive: true, mode: 0o700 });
  const log = path.join(logs, 'postgres.log');
  try {
    await run(controlPath(runtime), [
      '-D',
      directory,
      '-l',
      log,
      '-o',
      `-p ${runtime.config.pgPort} -h 127.0.0.1`,
      '-w',
      '-t',
      '60',
      'start',
    ]);
    runtime.databaseRunning = true;
  } catch (error) {
    const detail = (await fs.readFile(log, 'utf8').catch(() => '')).slice(-8000);
    throw new Error(`Avvio PostgreSQL non riuscito: ${error.message}\n${detail}`);
  }
}
async function stopDatabase(runtime) {
  const control = controlPath(runtime);
  const directory = path.join(runtime.dataDir, 'postgres');
  const running = await run(control, ['-D', directory, 'status']).then(
    () => true,
    (error) => {
      if (error.exitCode === 3) return false;
      throw error;
    },
  );
  if (running) await run(control, ['-D', directory, '-m', 'fast', '-w', 'stop']);
  runtime.databaseRunning = false;
}
module.exports = { startDatabase, stopDatabase };

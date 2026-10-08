const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const backend = path.resolve(__dirname, '../../backend');
const requireBackend = createRequire(path.join(backend, 'package.json'));
const { Client } = requireBackend('pg');
const { createBackup } = require('./server-backup.cjs');
let child;
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  stopping = true;
  child?.kill(signal);
});

async function backupBeforeMigration() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query("SELECT to_regclass('public.\"_prisma_migrations\"') AS table_name");
    if (!rows[0].table_name) return;
    const applied = await client.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
    const names = new Set(applied.rows.map((row) => row.migration_name));
    const entries = await fs.readdir(path.join(backend, 'prisma/migrations'), { withFileTypes: true });
    if (!entries.some((entry) => entry.isDirectory() && !names.has(entry.name))) return;
    console.log(`Backup before migrations: ${await createBackup('before-migration')}`);
  } finally { await client.end(); }
}

function execute(args) {
  if (stopping) throw new Error('Shutdown requested');
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, args, { cwd: backend, stdio: 'inherit', env: process.env });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      child = undefined;
      if (stopping) resolve(0);
      else if (code === 0) resolve(0);
      else reject(new Error(`Service exited: ${code ?? signal}`));
    });
  });
}

(async () => {
  await backupBeforeMigration();
  await execute([requireBackend.resolve('prisma/build/index.js'), 'migrate', 'deploy']);
  if (!stopping) await execute(['--import', 'tsx', '--import', './prisma-alias-register.mjs', 'dist/infrastructure/runtime/main.js']);
})().catch((error) => { console.error(error.message); process.exitCode = 1; });

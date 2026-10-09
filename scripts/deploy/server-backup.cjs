const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { tmpdir } = require('node:os');

function databaseEnvironment() {
  const url = new URL(process.env.DATABASE_URL);
  if (!['postgresql:', 'postgres:'].includes(url.protocol)) throw new Error('PostgreSQL URL required');
  return {
    ...process.env,
    PGHOST: url.hostname, PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: url.searchParams.get('sslmode') || 'prefer',
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error || result.status !== 0)
    throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.status}`);
  return result.stdout;
}

/** Logical PostgreSQL snapshot plus attachments and encryption keys; never archive live PG files. */
async function createBackup(reason = 'manual') {
  const data = path.resolve(process.env.DATA_DIR || '/data');
  const directory = path.join(data, 'backups');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const name = `seminai-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const staging = await fs.mkdtemp(path.join(tmpdir(), 'seminai-backup-'));
  const archive = path.join(directory, `${name}.tar.gz`);
  try {
    run('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', path.join(staging, 'database.dump')], { env: databaseEnvironment() });
    await fs.cp(data, path.join(staging, 'app'), {
      recursive: true, filter: (source) => source !== directory,
    });
    await fs.writeFile(path.join(staging, 'manifest.json'), JSON.stringify({
      format: 'seminai-server-backup', version: 1, postgresMajor: 16, reason,
      createdAt: new Date().toISOString(),
    }));
    run('tar', ['-czf', `${archive}.partial`, '-C', staging, 'manifest.json', 'database.dump', 'app']);
    await fs.chmod(`${archive}.partial`, 0o600);
    await fs.rename(`${archive}.partial`, archive);
    return archive;
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
    await fs.rm(`${archive}.partial`, { force: true });
  }
}

module.exports = { createBackup, databaseEnvironment, run };
if (require.main === module) createBackup().then(console.log).catch((error) => {
  console.error(error.message); process.exitCode = 1;
});

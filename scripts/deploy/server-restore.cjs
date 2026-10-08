const fs = require('node:fs/promises');
const path = require('node:path');
const { tmpdir } = require('node:os');
const { createBackup, databaseEnvironment, run } = require('./server-backup.cjs');

async function restore(archive) {
  if (!archive) throw new Error('Pass the backup archive path');
  const source = path.resolve(archive);
  const names = run('tar', ['-tzf', source]).trim().split('\n');
  if (names.some((name) => name.startsWith('/') || name.split('/').includes('..') || name.startsWith('app/backups') ||
      !['manifest.json', 'database.dump', 'app'].includes(name.split('/')[0])))
    throw new Error('Invalid backup paths');
  if (run('tar', ['-tvzf', source]).trim().split('\n').some((line) => !['-', 'd'].includes(line[0])))
    throw new Error('Backup links and special files are not supported');
  const staging = await fs.mkdtemp(path.join(tmpdir(), 'seminai-restore-'));
  try {
    run('tar', ['-xzf', source, '-C', staging]);
    const manifest = JSON.parse(await fs.readFile(path.join(staging, 'manifest.json'), 'utf8'));
    if (manifest.format !== 'seminai-server-backup' || manifest.version !== 1)
      throw new Error('Unsupported backup format');
    console.log(`Recovery snapshot: ${await createBackup('before-restore')}`);
    run('pg_restore', ['--clean', '--if-exists', '--single-transaction', '--no-owner', '--no-acl',
      '--dbname', databaseEnvironment().PGDATABASE, path.join(staging, 'database.dump')], { env: databaseEnvironment() });
    const data = path.resolve(process.env.DATA_DIR || '/data');
    for (const entry of await fs.readdir(data)) {
      if (entry !== 'backups') await fs.rm(path.join(data, entry), { recursive: true, force: true });
    }
    await fs.cp(path.join(staging, 'app'), data, { recursive: true });
    console.log('Database, attachments and encryption keys restored.');
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}
restore(process.argv[2]).catch((error) => { console.error(error.message); process.exitCode = 1; });

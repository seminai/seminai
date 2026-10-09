const fs = require('node:fs/promises');
const path = require('node:path');
const { readPortable, importTables } = require('./portable-data.cjs');
const { run } = require('./runtime.cjs');
/** Import into a fresh database. Existing data is snapshotted before any replacement. */
async function importPortable(runtime, source) {
  const archive = await readPortable(source);
  const stamp = Date.now();
  const temporary = `seminai_import_${stamp}`;
  await runtime.snapshot(path.join(runtime.dataDir, 'backups', `before-import-${stamp}.zip`));
  await runtime.stopApi();
  const administrator = runtime.pg.getPgClient('postgres', '127.0.0.1');
  await administrator.connect();
  const recovery = path.join(runtime.dataDir, 'backups', `files-before-import-${stamp}`);
  let switched = false;
  try {
    await runtime.createDatabase(temporary);
    const url = new URL(runtime.env.DATABASE_URL);
    url.pathname = `/${temporary}`;
    const backend = path.join(runtime.runtimeDir, 'backend');
    const prisma = path.join(
      path.dirname(require.resolve('prisma/package.json', { paths: [backend] })),
      'build/index.js',
    );
    await run(process.execPath, [prisma, 'migrate', 'deploy'], {
      cwd: backend,
      env: { ...runtime.env, DATABASE_URL: url.href, DIRECT_URL: url.href },
    });
    const client = runtime.pg.getPgClient(temporary, '127.0.0.1');
    await client.connect();
    try {
      await importTables(client, archive);
    } finally {
      await client.end();
    }
    const stage = path.join(runtime.dataDir, 'restore-staging');
    await fs.rm(stage, { recursive: true, force: true });
    await fs.mkdir(stage, { recursive: true, mode: 0o700 });
    for (const entry of archive.zip.getEntries())
      if (entry.entryName.startsWith('storage/') || entry.entryName.startsWith('secrets/'))
        archive.zip.extractEntryTo(entry, stage, true, true);
    await fs.mkdir(recovery, { recursive: true, mode: 0o700 });
    for (const folder of ['storage', 'secrets', 'mcp', 'tunnel.bin']) {
      if (await fs.stat(path.join(runtime.dataDir, folder)).catch(() => null))
        await fs.rename(path.join(runtime.dataDir, folder), path.join(recovery, folder));
      if (await fs.stat(path.join(stage, folder)).catch(() => null))
        await fs.rename(path.join(stage, folder), path.join(runtime.dataDir, folder));
    }
    await administrator.query(`ALTER DATABASE seminai RENAME TO seminai_before_import_${stamp}`);
    try {
      await administrator.query(`ALTER DATABASE ${temporary} RENAME TO seminai`);
    } catch (error) {
      await administrator.query(`ALTER DATABASE seminai_before_import_${stamp} RENAME TO seminai`);
      throw error;
    }
    switched = true;
    // Credentials are reloaded from the imported recovery material on the next API start.
    delete runtime.env.JWT_SECRET;
    delete runtime.env.ENCRYPTION_SECRET;
  } finally {
    await administrator.end();
    if (!switched && (await fs.stat(recovery).catch(() => null))) {
      for (const folder of ['storage', 'secrets', 'mcp', 'tunnel.bin'])
        if (await fs.stat(path.join(recovery, folder)).catch(() => null)) {
          await fs.rm(path.join(runtime.dataDir, folder), { recursive: true, force: true });
          await fs.rename(path.join(recovery, folder), path.join(runtime.dataDir, folder));
        }
    }
    await runtime.startApi();
  }
}
module.exports = { importPortable };

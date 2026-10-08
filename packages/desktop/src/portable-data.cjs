const fs = require('node:fs/promises');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { Client } = require('pg');
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const excluded = new Set(['_prisma_migrations', 'LocalKeyValue', 'McpPairing', 'DesktopQueueJob']);
/** Portable committed business data. Background queue leases and temporary cache are not transferred. */
async function exportPortable({ databaseUrl, dataDir, destination, secrets = {} }) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const zip = new AdmZip();
  const tables = {};
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const names = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );
    for (const { tablename } of names.rows) {
      if (excluded.has(tablename)) continue;
      const rows = await client.query(
        `SELECT row_to_json(t) AS value FROM public.${quote(tablename)} t`,
      );
      const columns = await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
        [tablename],
      );
      tables[tablename] = columns.rows.map((row) => row.column_name);
      zip.addFile(
        `tables/${tablename}.json`,
        Buffer.from(JSON.stringify(rows.rows.map((row) => row.value))),
      );
    }
    await client.query('COMMIT');
    for (const name of ['jwt', 'encryption']) {
      const value =
        secrets[name] || (await fs.readFile(path.join(dataDir, 'secrets', name), 'utf8'));
      if (value.trim().length < 32) throw new Error('Chiavi di recupero mancanti');
      zip.addFile(`secrets/${name}`, Buffer.from(value.trim()));
    }
    if (await fs.stat(path.join(dataDir, 'storage')).catch(() => null))
      zip.addLocalFolder(path.join(dataDir, 'storage'), 'storage');
    zip.addFile(
      'seminai-portable.json',
      Buffer.from(JSON.stringify({ format: 1, tables, createdAt: new Date().toISOString() })),
    );
    await zip.writeZipPromise(destination);
    await fs.chmod(destination, 0o600);
  } finally {
    await client.end();
  }
}
async function readPortable(source) {
  const zip = new AdmZip(source);
  const metadata = JSON.parse(zip.readAsText('seminai-portable.json'));
  if (
    metadata.format !== 1 ||
    typeof metadata.tables !== 'object' ||
    Object.keys(metadata.tables).length > 1000
  )
    throw new Error('Archivio portabile non valido');
  if (!zip.getEntry('secrets/encryption') || !zip.getEntry('secrets/jwt'))
    throw new Error('Chiavi di recupero mancanti');
  for (const entry of zip.getEntries()) {
    if (
      entry.entryName.includes('..') ||
      path.isAbsolute(entry.entryName) ||
      entry.entryName.includes('\\')
    )
      throw new Error('Percorso non valido');
  }
  return { zip, metadata };
}
async function importTables(client, archive) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL session_replication_role='replica'");
    const target = await client.query(
      "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'",
    );
    for (const [table, columns] of Object.entries(archive.metadata.tables)) {
      if (excluded.has(table)) continue;
      const allowed = target.rows
        .filter((row) => row.table_name === table)
        .map((row) => row.column_name);
      if (
        !allowed.length ||
        !Array.isArray(columns) ||
        columns.some((column) => !allowed.includes(column))
      )
        throw new Error(`Versione dati incompatibile: ${table}`);
      const rows = JSON.parse(archive.zip.readAsText(`tables/${table}.json`));
      if (!Array.isArray(rows)) throw new Error('Dati non validi');
      const selected = [...columns];
      if (table === 'Stock' && !selected.includes('occurredAt')) {
        selected.push('occurredAt');
        for (const row of rows) row.occurredAt = row.ddtDate || row.invoiceDate || row.createdAt;
      }
      await client.query(`TRUNCATE public.${quote(table)} CASCADE`);
      // Stage all truncation before insertion below: FK ordering must not discard already inserted rows.
      archive[table] = { rows, selected };
    }
    for (const table of Object.keys(archive.metadata.tables)) {
      if (excluded.has(table)) continue;
      const { rows, selected } = archive[table];
      const fields = selected.map(quote).join(',');
      for (let index = 0; index < rows.length; index += 100)
        await client.query(
          `INSERT INTO public.${quote(table)} (${fields}) SELECT ${fields} FROM jsonb_populate_recordset(NULL::public.${quote(table)}, $1::jsonb)`,
          [JSON.stringify(rows.slice(index, index + 100))],
        );
    }
    await validateForeignKeys(client);
    const sequences = await client.query(
      "SELECT table_name,column_name,pg_get_serial_sequence(format('%I.%I',table_schema,table_name),column_name) AS sequence FROM information_schema.columns WHERE table_schema='public' AND column_default LIKE 'nextval%'",
    );
    for (const row of sequences.rows)
      if (row.sequence)
        await client.query(
          `SELECT setval($1, COALESCE((SELECT MAX(${quote(row.column_name)}) FROM public.${quote(row.table_name)}),1), EXISTS(SELECT 1 FROM public.${quote(row.table_name)}))`,
          [row.sequence],
        );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
async function validateForeignKeys(client) {
  const keys =
    await client.query(`SELECT c.conname, c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent,
    ARRAY(SELECT attname::text FROM unnest(c.conkey) WITH ORDINALITY k(id,n) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.id ORDER BY k.n) AS columns,
    ARRAY(SELECT attname::text FROM unnest(c.confkey) WITH ORDINALITY k(id,n) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.id ORDER BY k.n) AS refs
    FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE c.contype='f' AND n.nspname='public'`);
  for (const key of keys.rows) {
    const present = key.columns.map((column) => `c.${quote(column)} IS NOT NULL`).join(' AND ');
    const match = key.columns
      .map((column, index) => `c.${quote(column)}=p.${quote(key.refs[index])}`)
      .join(' AND ');
    const invalid = await client.query(
      `SELECT 1 FROM ${key.child} c WHERE ${present} AND NOT EXISTS(SELECT 1 FROM ${key.parent} p WHERE ${match}) LIMIT 1`,
    );
    if (invalid.rowCount) throw new Error(`Riferimenti incompleti nell’archivio: ${key.conname}`);
  }
}
module.exports = { exportPortable, readPortable, importTables };

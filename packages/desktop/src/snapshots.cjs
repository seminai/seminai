const fs = require('node:fs/promises');
const path = require('node:path');
const AdmZip = require('adm-zip');

/** A stopped-cluster archive includes attachments, encrypted settings and recovery keys. */
async function saveSnapshot(dataDir, destination) {
  const zip = new AdmZip();
  for (const entry of await fs.readdir(dataDir, { withFileTypes: true })) {
    if (['backups', 'logs', 'restore-staging'].includes(entry.name)) continue;
    const source = path.join(dataDir, entry.name);
    if (entry.isDirectory()) zip.addLocalFolder(source, entry.name);
    else if (entry.isFile()) zip.addLocalFile(source);
  }
  zip.addFile(
    'seminai-backup.json',
    Buffer.from(
      JSON.stringify({
        format: 1,
        postgres: 16,
        platform: process.platform,
        arch: process.arch,
        createdAt: new Date().toISOString(),
      }),
    ),
  );
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await zip.writeZipPromise(destination);
  await fs.chmod(destination, 0o600);
}
async function validateSnapshot(source) {
  const zip = new AdmZip(source);
  const metadata = JSON.parse(zip.readAsText('seminai-backup.json'));
  if (
    metadata.format !== 1 ||
    metadata.postgres !== 16 ||
    metadata.platform !== process.platform ||
    metadata.arch !== process.arch
  ) {
    throw new Error(
      'Questo backup richiede lo stesso sistema e architettura. Per trasferire i dati usa l’esportazione portabile.',
    );
  }
  if (!zip.getEntry('postgres/PG_VERSION') || !zip.getEntry('desktop.json'))
    throw new Error('Backup incompleto');
  for (const entry of zip.getEntries()) {
    if (
      entry.entryName.includes('..') ||
      path.isAbsolute(entry.entryName) ||
      entry.entryName.includes('\\')
    )
      throw new Error('Percorso del backup non valido');
  }
  return zip;
}
module.exports = { saveSnapshot, validateSnapshot };

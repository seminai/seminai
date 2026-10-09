const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { saveSnapshot, validateSnapshot } = require('./snapshots.cjs');
test('backup contains recovery secrets, excludes recursive backups and refuses a foreign cluster', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'seminai-backup-check-'));
  try {
    for (const name of ['postgres', 'secrets', 'backups']) await fs.mkdir(path.join(folder, name));
    await fs.writeFile(path.join(folder, 'postgres/PG_VERSION'), '16');
    await fs.writeFile(path.join(folder, 'secrets/encryption'), 'synthetic-recovery-key');
    await fs.writeFile(path.join(folder, 'desktop.json'), '{}');
    const destination = path.join(folder, 'backups/test.zip');
    await saveSnapshot(folder, destination);
    const archive = await validateSnapshot(destination);
    assert.equal(archive.readAsText('secrets/encryption'), 'synthetic-recovery-key');
    assert.equal(
      archive.getEntries().some((entry) => entry.entryName.startsWith('backups/')),
      false,
    );
    archive.updateFile(
      'seminai-backup.json',
      Buffer.from(
        JSON.stringify({ format: 1, postgres: 15, platform: process.platform, arch: process.arch }),
      ),
    );
    await archive.writeZipPromise(destination);
    await assert.rejects(validateSnapshot(destination), /stesso sistema/);
    const incomplete = new AdmZip();
    incomplete.addFile(
      'seminai-backup.json',
      Buffer.from(
        JSON.stringify({ format: 1, postgres: 16, platform: process.platform, arch: process.arch }),
      ),
    );
    await incomplete.writeZipPromise(destination);
    await assert.rejects(validateSnapshot(destination), /incompleto/);
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});

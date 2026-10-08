import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { downloadArtifact } from '@electron/get';
import { desktopSbom } from './desktop-sbom.mjs';
const directory = path.resolve('packages/desktop/release');
// Include build dependencies as well: React is compiled into the renderer and Electron/Node
// are development dependencies which become distributed binaries in the desktop artifact.
// Inventory actual packages: npm sbom rejects unrelated optional peer-range conflicts
// in AI/build tools, even though those packages were installed by the committed lockfile.
const sbom = await desktopSbom(process.cwd());
for (const [name, version, url] of [
  ['PostgreSQL', '16.14', 'https://www.postgresql.org/about/licence/'],
  ['OpenAI tunnel-client', '0.0.16', 'https://github.com/openai/tunnel-client'],
  ['Node.js', '22.23.1', 'https://nodejs.org/'],
  ['Electron', '44.7.0', 'https://www.electronjs.org/'],
])
  sbom.components.push({
    type: 'application',
    name,
    version,
    'bom-ref': `native:${name}:${version}`,
    externalReferences: [{ type: 'website', url }],
  });
await writeFile(path.join(directory, 'SBOM.cdx.json'), JSON.stringify(sbom, null, 2));
const notices = new AdmZip();
for (const file of ['LICENSE', 'NOTICE']) notices.addLocalFile(file);
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
for (const location of Object.keys(lock.packages).filter((name) =>
  name.includes('node_modules/'),
)) {
  const files = await readdir(location).catch(() => []);
  for (const file of files.filter((name) => /^(licen[sc]e|copying|notice)(\.|$)/i.test(name))) {
    try {
      const content = await readFile(path.join(location, file));
      notices.addFile(`npm/${location}/${file}`, content);
    } catch (error) {
      if (error.code !== 'EISDIR') throw error;
    }
  }
}
const electronArchive = await downloadArtifact({
  version: '44.7.0',
  artifactName: 'electron',
  platform: process.platform,
  arch: process.arch,
  checksums: JSON.parse(await readFile('node_modules/electron/checksums.json', 'utf8')),
});
const electronZip = new AdmZip(electronArchive);
for (const name of ['LICENSE', 'LICENSES.chromium.html']) {
  const entry = electronZip.getEntry(name);
  if (!entry) throw new Error('Electron license missing from official distribution');
  notices.addFile(`electron/${name}`, entry.getData());
}
notices.addLocalFolder('packages/desktop/vendor/tunnel', 'tunnel', (name) =>
  /license|notice|\.json$/i.test(name),
);
const nodeLicense = await fetch('https://raw.githubusercontent.com/nodejs/node/v22.23.1/LICENSE');
if (!nodeLicense.ok) throw new Error('Cannot collect bundled Node.js license');
notices.addFile('node/LICENSE', Buffer.from(await nodeLicense.text()));
notices.addFile('BUILD-DEPENDENCIES.json', Buffer.from(JSON.stringify(lock, null, 2)));
await notices.writeZipPromise(path.join(directory, 'licenses.zip'));
await writeFile(
  path.join(directory, 'LICENSES.txt'),
  `${await readFile('NOTICE', 'utf8')}\nComplete third-party license texts: licenses.zip. SBOM includes runtime and build dependencies.\n`,
);
const files = (await readdir(directory)).filter(
  (name) =>
    /\.(exe|dmg|zip|AppImage|deb)$/.test(name) || ['SBOM.cdx.json', 'LICENSES.txt'].includes(name),
);
const sums = [];
for (const file of files)
  sums.push(
    `${createHash('sha256')
      .update(await readFile(path.join(directory, file)))
      .digest('hex')}  ${file}`,
  );
const mcp = 'seminai-mcp-1.0.1.mcpb';
sums.push(
  `${createHash('sha256')
    .update(await readFile(path.join('packages/mcp', mcp)))
    .digest('hex')}  ${mcp}`,
);
await writeFile(path.join(directory, 'SHA256SUMS.txt'), sums.join('\n') + '\n');

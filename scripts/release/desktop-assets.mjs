import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import AdmZip from 'adm-zip';
const directory = path.resolve('packages/desktop/release');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// Include build dependencies as well: React is compiled into the renderer and Electron/Node
// are development dependencies which become distributed binaries in the desktop artifact.
const result = spawnSync(npm, ['sbom', '--sbom-format', 'cyclonedx'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  shell: process.platform === 'win32',
});
if (result.status !== 0) throw new Error(result.stderr || 'SBOM generation failed');
const sbom = JSON.parse(result.stdout);
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
notices.addLocalFile('node_modules/electron/dist/LICENSES.chromium.html', 'electron');
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

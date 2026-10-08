import { mkdir, writeFile, chmod, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import AdmZip from 'adm-zip';
const version = 'v0.0.16';
const platform = process.platform === 'win32' ? 'windows' : process.platform;
const arch = process.arch === 'x64' ? 'amd64' : process.arch;
const name = `tunnel-client-${version}-${platform}-${arch}.zip`;
const base = `https://github.com/openai/tunnel-client/releases/download/${version}/`;
const [archive, sums] = await Promise.all([
  fetch(base + name).then(async (r) => {
    if (!r.ok) throw new Error('Tunnel download failed');
    return Buffer.from(await r.arrayBuffer());
  }),
  fetch(base + 'SHA256SUMS.txt').then((r) => r.text()),
]);
const expected = sums
  .split('\n')
  .find((line) => line.trim().endsWith(name))
  ?.trim()
  .split(/\s+/)[0];
if (!expected || createHash('sha256').update(archive).digest('hex') !== expected)
  throw new Error('Tunnel checksum mismatch');
const destination = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../vendor/tunnel');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
new AdmZip(archive).extractAllTo(destination, true);
await writeFile(path.join(destination, 'SHA256SUMS.txt'), sums);
if (process.platform !== 'win32') {
  await chmod(path.join(destination, 'tunnel-client'), 0o755);
  await chmod(path.join(destination, 'cloudflared'), 0o755);
}
console.log(`Verified tunnel client ${version} for ${platform}/${arch}`);

import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = path.join(folder, 'release');
const candidates =
  process.platform === 'darwin'
    ? [`mac${process.arch === 'arm64' ? '-arm64' : ''}/Seminai.app/Contents/Resources/runtime`]
    : process.platform === 'win32'
      ? ['win-unpacked/resources/runtime']
      : [`linux${process.arch === 'arm64' ? '-arm64' : ''}-unpacked/resources/runtime`];
const runtime = candidates.map((name) => path.join(release, name)).find(existsSync);
if (!runtime) throw new Error('Packaged runtime not found');
const node = path.join(runtime, process.platform === 'win32' ? 'node.exe' : 'node');
const result = spawnSync(node, [path.join(folder, 'scripts/smoke.cjs')], {
  env: { ...process.env, SEMINAI_RUNTIME_DIR: runtime },
  stdio: 'inherit',
  timeout: 180000,
});
if (result.status !== 0) process.exit(result.status || 1);

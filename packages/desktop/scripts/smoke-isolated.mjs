import { cp, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// A runtime under the checkout can accidentally resolve undeclared development packages.
// Move it outside that ancestor chain before asserting that the installation is autonomous.
const source = path.resolve(process.argv[2] || 'packages/desktop/stage');
const directory = await mkdtemp(path.join(os.tmpdir(), 'seminai-isolated-runtime-'));
const runtime = path.join(directory, 'runtime');
try {
  await cp(source, runtime, { recursive: true, verbatimSymlinks: true });
  const node = path.join(runtime, process.platform === 'win32' ? 'node.exe' : 'node');
  const result = spawnSync(node, [fileURLToPath(new URL('smoke.cjs', import.meta.url))], {
    cwd: directory,
    env: { ...process.env, NODE_PATH: '', SEMINAI_RUNTIME_DIR: runtime },
    stdio: 'inherit',
    timeout: 180000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Isolated runtime failed (${result.status})`);
} finally {
  await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
}

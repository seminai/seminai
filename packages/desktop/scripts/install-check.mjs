import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Install/uninstall only on disposable CI runners, never on a developer's computer.
if (process.env.GITHUB_ACTIONS !== 'true')
  throw new Error('Installer acceptance requires a disposable GitHub runner');
const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = path.join(desktop, 'release');
const directory = await mkdtemp(path.join(os.tmpdir(), 'seminai-installer-'));
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env, timeout: 300000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status})`);
}
const extension =
  process.platform === 'win32' ? '.exe' : process.platform === 'darwin' ? '.dmg' : '.deb';
const artifactArch = extension === '.deb' && process.arch === 'x64' ? 'amd64' : process.arch;
const asset = (await readdir(release)).find(
  (name) => name.startsWith('Seminai-') && name.endsWith(`-${artifactArch}${extension}`),
);
if (!asset) throw new Error('Installer artifact missing');
let runtime;
let installed = false;
try {
  if (process.platform === 'win32') {
    run(path.join(release, asset), ['/S', `/D=${directory}`]);
    runtime = path.join(directory, 'resources/runtime');
  } else if (process.platform === 'darwin') {
    const mount = path.join(directory, 'volume');
    run('hdiutil', [
      'attach',
      '-nobrowse',
      '-readonly',
      '-mountpoint',
      mount,
      path.join(release, asset),
    ]);
    try {
      run('ditto', [path.join(mount, 'Seminai.app'), path.join(directory, 'Seminai.app')]);
    } finally {
      run('hdiutil', ['detach', mount]);
    }
    runtime = path.join(directory, 'Seminai.app/Contents/Resources/runtime');
  } else {
    run('sudo', ['apt-get', 'update', '-qq']);
    run('sudo', ['apt-get', 'install', '-y', path.join(release, asset)]);
    runtime = '/opt/Seminai/resources/runtime';
  }
  installed = true;
  const node = path.join(runtime, process.platform === 'win32' ? 'node.exe' : 'node');
  for (const script of ['smoke.cjs', 'recovery-check.cjs'])
    run(node, [path.join(desktop, 'scripts', script)], {
      ...process.env,
      SEMINAI_RUNTIME_DIR: runtime,
    });
  console.log('PASS: installer artifact, bundled services, record persistence and recovery');
} finally {
  if (installed && process.platform === 'linux') run('sudo', ['dpkg', '-r', 'seminai']);
  if (installed && process.platform === 'win32')
    run(path.join(directory, 'Uninstall Seminai.exe'), ['/S']);
  await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
}

import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const target = path.join(root, 'packages/desktop/stage');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const file of ['package.json', 'package-lock.json', 'LICENSE'])
  await cp(path.join(root, file), path.join(target, file));
const packages = [
  'backend',
  'frontend',
  'evals',
  ...(await readdir(path.join(root, 'packages'))).map((name) => `packages/${name}`),
];
for (const folder of packages) {
  await mkdir(path.join(target, folder), { recursive: true });
  await cp(path.join(root, folder, 'package.json'), path.join(target, folder, 'package.json'));
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const install = spawnSync(
  npm,
  [
    'ci',
    '--omit=dev',
    '--no-audit',
    '--no-fund',
    '--workspace',
    '@seminai/backend',
    '--workspace',
    '@seminai/mcp-connector',
    '--workspace',
    '@seminai/desktop',
  ],
  { cwd: target, stdio: 'inherit', shell: process.platform === 'win32' },
);
if (install.status !== 0) throw new Error('Runtime dependencies installation failed');
const trackedData = spawnSync('git', ['ls-files', 'backend/dataset'], {
  cwd: root,
  encoding: 'utf8',
});
if (trackedData.status !== 0) throw new Error('Cannot enumerate licensed datasets');
for (const file of trackedData.stdout.trim().split('\n').filter(Boolean)) {
  await mkdir(path.dirname(path.join(target, file)), { recursive: true });
  await cp(path.join(root, file), path.join(target, file));
}
for (const file of [
  'backend/dist',
  'backend/prisma',
  'backend/prisma.config.ts',
  'backend/tsconfig.json',
  'frontend/dist',
  'packages/mcp/dist',
])
  await cp(path.join(root, file), path.join(target, file), { recursive: true });
for (const file of ['prisma-alias-loader.mjs', 'prisma-alias-register.mjs'])
  await cp(path.join(root, 'scripts/deploy', file), path.join(target, 'backend', file));
await cp(path.join(root, 'packages/desktop/src'), path.join(target, 'desktop'), {
  recursive: true,
});
const nodePath = require.resolve(process.platform === 'win32' ? 'node/bin/node.exe' : 'node/bin/node');
await cp(nodePath, path.join(target, process.platform === 'win32' ? 'node.exe' : 'node'));
await cp(path.join(root, 'packages/desktop/vendor/tunnel'), path.join(target, 'tunnel'), {
  recursive: true,
});
console.log(`Standalone runtime staged: ${target}`);

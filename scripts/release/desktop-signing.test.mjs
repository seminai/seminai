import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const signRuntime = require('../../packages/desktop/scripts/sign-runtime.cjs');

function preflight(environment) {
  return spawnSync(process.execPath, ['scripts/release/check-desktop-signing.mjs'], {
    env: { PATH: process.env.PATH, ...environment }, encoding: 'utf8',
  });
}

test('unsigned PR does not require signing credentials', () => {
  assert.equal(preflight({ GITHUB_REF_TYPE: 'branch' }).status, 0);
});
test('signed macOS build fails without notarization credentials', () => {
  const result = preflight({ SEMINAI_SIGNING: 'true', DESKTOP_TARGET: 'mac', MACOS_DEVELOPER_ID: 'Synthetic identity' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /APPLE_APP_SPECIFIC_PASSWORD/);
});
test('local Apple profile and Azure profile are supported without exporting PFX', () => {
  assert.equal(preflight({ SEMINAI_SIGNING: 'true', DESKTOP_TARGET: 'mac', MACOS_DEVELOPER_ID: 'Synthetic identity', APPLE_KEYCHAIN_PROFILE: 'Synthetic profile' }).status, 0);
  assert.equal(preflight({ SEMINAI_SIGNING: 'true', DESKTOP_TARGET: 'win', AZURE_ARTIFACT_SIGNING_ENDPOINT: 'https://example.test', AZURE_ARTIFACT_SIGNING_ACCOUNT_NAME: 'synthetic', AZURE_ARTIFACT_SIGNING_CERT_PROFILE_NAME: 'synthetic' }).status, 0);
});
test('tag mismatch fails before signing', () => {
  assert.notEqual(preflight({ GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.0.0' }).status, 0);
});
test('Windows hook signs nested runtime executables and fails closed on an unsigned dependency', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'seminai-sign-test-'));
  const previous = process.env.SEMINAI_SIGNING;
  process.env.SEMINAI_SIGNING = 'true';
  try {
    const runtime = path.join(directory, 'resources/runtime');
    await mkdir(path.join(runtime, 'postgres/lib'), { recursive: true });
    for (const name of ['node.exe', 'postgres/lib/database.dll', 'postgres/lib/module.node', 'package.json'])
      await writeFile(path.join(runtime, name), 'synthetic');
    const signed = [];
    const context = { appOutDir: directory, electronPlatformName: 'win32', packager: {
      signIf: async (file) => { signed.push(path.relative(runtime, file).replaceAll('\\', '/')); return true; },
    } };
    await signRuntime(context);
    assert.deepEqual(signed.sort(), ['node.exe', 'postgres/lib/database.dll', 'postgres/lib/module.node']);
    context.packager.signIf = async () => false;
    await assert.rejects(signRuntime(context), /Unsigned runtime file/);
  } finally {
    if (previous === undefined) delete process.env.SEMINAI_SIGNING; else process.env.SEMINAI_SIGNING = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { signingOptions } from './macos-entitlements.mjs';

test('only the bundled Intel Node receives the executable-memory exception', () => {
  const runtime = path.resolve('synthetic.app/Contents/Resources/runtime');
  const exception = 'com.apple.security.cs.allow-unsigned-executable-memory';
  const node = path.join(runtime, 'node');
  assert.ok(signingOptions(node, { runtime, arch: 'x64' }).entitlements.includes(exception));
  for (const [file, arch] of [
    [node, 'arm64'],
    [path.dirname(runtime), 'x64'],
    [path.join(runtime, 'node_modules/addon.node'), 'x64'],
    [path.resolve('synthetic.app/Contents/Frameworks/Seminai Helper (Renderer).app'), 'x64'],
  ]) {
    const options = signingOptions(file, { runtime, arch });
    assert.equal(options.hardenedRuntime, true);
    assert.ok(!options.entitlements.includes(exception));
    assert.ok(!options.entitlements.includes('com.apple.security.cs.disable-library-validation'));
  }
});

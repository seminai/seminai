import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { desktopSbom } from './desktop-sbom.mjs';

test('SBOM records installed versions and archive hashes without inventing absent platform packages', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'seminai-sbom-'));
  try {
    await mkdir(path.join(root, 'node_modules/@sample/library'), { recursive: true });
    await writeFile(
      path.join(root, 'node_modules/@sample/library/package.json'),
      JSON.stringify({ name: '@sample/library', version: '2.0.0', license: 'MIT' }),
    );
    await writeFile(
      path.join(root, 'package-lock.json'),
      JSON.stringify({
        version: '1.0.1-rc.1',
        packages: {
          '': { version: '1.0.1-rc.1' },
          'node_modules/@sample/library': {
            version: '2.0.0',
            integrity: 'sha256-' + Buffer.alloc(32, 1).toString('base64'),
          },
          'node_modules/platform-package': { version: '1.0.0', optional: true },
        },
      }),
    );
    const sbom = await desktopSbom(root);
    assert.equal(sbom.components.length, 1);
    assert.equal(sbom.components[0].purl, 'pkg:npm/%40sample/library@2.0.0');
    assert.deepEqual(sbom.components[0].hashes, [{ alg: 'SHA-256', content: '01'.repeat(32) }]);
    assert.equal(sbom.metadata.component.version, '1.0.1-rc.1');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

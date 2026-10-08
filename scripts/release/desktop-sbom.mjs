import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Inventory the installed build tree, including renderer and bundled runtime dependencies. */
export async function desktopSbom(root) {
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  const components = [];
  for (const [location, locked] of Object.entries(lock.packages)) {
    if (!location || locked.link) continue;
    const manifest = await readFile(path.join(root, location, 'package.json'), 'utf8').catch(
      (error) => {
        if (error.code === 'ENOENT') return null; // Optional packages for other platforms.
        throw error;
      },
    );
    if (!manifest) continue;
    const pkg = JSON.parse(manifest);
    if (!pkg.name || !pkg.version) throw new Error(`Incomplete package metadata: ${location}`);
    const component = {
      type: 'library',
      name: pkg.name,
      version: pkg.version,
      'bom-ref': `npm:${location}:${pkg.version}`,
      purl: `pkg:npm/${pkg.name.replace(/^@/, '%40')}@${encodeURIComponent(pkg.version)}`,
      properties: [{ name: 'seminai:installed-path', value: location }],
    };
    if (typeof pkg.license === 'string') component.licenses = [{ license: { name: pkg.license } }];
    if (locked.version === pkg.version && locked.integrity) {
      const hashes = String(locked.integrity)
        .split(' ')
        .flatMap((integrity) => {
          const match = /^(sha1|sha256|sha384|sha512)-([\w+/=]+)$/.exec(integrity);
          if (!match) return [];
          return [
            {
              alg: match[1].replace('sha', 'SHA-'),
              content: Buffer.from(match[2], 'base64').toString('hex'),
            },
          ];
        });
      if (hashes.length) component.hashes = hashes;
    }
    if (locked.resolved?.startsWith('https://'))
      component.externalReferences = [{ type: 'distribution', url: locked.resolved }];
    components.push(component);
  }
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: {
        type: 'application',
        name: 'Seminai',
        version: lock.version,
        'bom-ref': 'seminai',
      },
      properties: [
        {
          name: 'seminai:inventory-scope',
          value:
            'Installed build and runtime packages plus bundled native applications. Optional packages absent on this platform are excluded. Dependency relationships are not asserted.',
        },
      ],
    },
    components,
  };
}

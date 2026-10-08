import { createRequire, builtinModules } from 'node:module';
import { build } from 'esbuild';
import AdmZip from 'adm-zip';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(path.join(root, 'bundle'), { recursive: true });
const nodeRequire = createRequire(import.meta.url);
await build({
  plugins: [
    {
      name: 'node-resolution',
      setup(builder) {
        builder.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith('node:') || builtinModules.includes(args.path))
            return { path: args.path, external: true };
          return { path: nodeRequire.resolve(args.path, { paths: [args.resolveDir] }) };
        });
      },
    },
  ],
  entryPoints: [path.join(root, 'src/desktop.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: path.join(root, 'bundle/server.cjs'),
});
const zip = new AdmZip();
zip.addLocalFile(path.join(root, 'bundle/server.cjs'), 'server');
zip.addFile(
  'manifest.json',
  Buffer.from(
    JSON.stringify(
      {
        manifest_version: '0.3',
        name: 'seminai',
        display_name: 'Seminai',
        version: '1.0.1',
        description: 'Quaderno e magazzino: lettura e proposte con conferma dentro Seminai.',
        author: { name: 'Seminai contributors' },
        license: 'AGPL-3.0-or-later',
        homepage: 'https://github.com/seminai/seminai',
        server: {
          type: 'node',
          entry_point: 'server/server.cjs',
          mcp_config: { command: 'node', args: ['${__dirname}/server/server.cjs'] },
        },
        compatibility: { runtimes: { node: '>=22' } },
      },
      null,
      2,
    ),
  ),
);
zip.addFile('LICENSE', await readFile(path.join(root, '../../LICENSE')));
await zip.writeZipPromise(path.join(root, 'seminai-mcp-1.0.1.mcpb'));
console.log('Created seminai-mcp-1.0.1.mcpb');

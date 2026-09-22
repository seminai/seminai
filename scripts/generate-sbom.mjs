#!/usr/bin/env node
import { mkdirSync, openSync, closeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'artifacts');
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, 'sbom.cdx.json');
const fd = openSync(outPath, 'w');
try {
  const result = spawnSync('npm', ['sbom', '--sbom-format', 'cyclonedx'], {
    cwd: root,
    stdio: ['ignore', fd, 'inherit'],
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} finally {
  closeSync(fd);
}
console.log(`Wrote ${outPath}`);

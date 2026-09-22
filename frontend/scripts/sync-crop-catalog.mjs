#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const source = resolve(projectRoot, '../backend/dataset/crop_family/crop.json');
const target = resolve(projectRoot, 'public/datasets/crop.json');

function log(message) {
  process.stdout.write(`[sync-crop-catalog] ${message}\n`);
}

if (!existsSync(source)) {
  log(`source not found: ${source}`);
  process.exit(1);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
log(`copied ${source} -> ${target}`);

#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  importForbiddenContentFragments,
  isExcludedSourcePath,
  mapDestination,
  sourceRepositories,
} from './import-policy.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const textExtensions = new Set([
  '.cjs',
  '.css',
  '.csv',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.prisma',
  '.sh',
  '.sql',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

function readTree(source, ref) {
  const output = execFileSync('git', ['-C', source, 'ls-tree', '-r', '-z', ref]);
  return output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const [metadata, path] = record.split('\t');
      const [mode, type, sha] = metadata.split(' ');
      return { mode, type, sha, path };
    })
    .filter((entry) => entry.type === 'blob' && !isExcludedSourcePath(entry.path));
}

function readBlobs(source, entries) {
  const input = `${entries.map((entry) => entry.sha).join('\n')}\n`;
  const result = spawnSync('git', ['-C', source, 'cat-file', '--batch'], {
    input,
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr.toString('utf8'));
  const blobs = [];
  let offset = 0;
  for (const entry of entries) {
    const headerEnd = result.stdout.indexOf(10, offset);
    const header = result.stdout.subarray(offset, headerEnd).toString('utf8');
    const [, type, sizeText] = header.split(' ');
    if (type !== 'blob') throw new Error(`Expected blob for ${entry.path}`);
    const size = Number(sizeText);
    const start = headerEnd + 1;
    blobs.push(result.stdout.subarray(start, start + size));
    offset = start + size + 1;
  }
  return blobs;
}

function isTextPath(path) {
  const extensionIndex = path.lastIndexOf('.');
  return extensionIndex >= 0 && textExtensions.has(path.slice(extensionIndex));
}

function hasForbiddenContent(path, content) {
  if (!isTextPath(path)) return false;
  const text = content.toString('utf8');
  return importForbiddenContentFragments.some((fragment) => text.includes(fragment));
}

function writeEntry(destination, entry, content) {
  const absoluteDestination = resolve(repositoryRoot, destination);
  if (!absoluteDestination.startsWith(`${repositoryRoot}/`)) {
    throw new Error(`Unsafe destination: ${destination}`);
  }
  if (missingOnly && existsSync(absoluteDestination)) return false;
  mkdirSync(dirname(absoluteDestination), { recursive: true });
  if (entry.mode === '120000') {
    symlinkSync(content.toString('utf8'), absoluteDestination);
    return true;
  }
  writeFileSync(absoluteDestination, content);
  if (entry.mode === '100755') chmodSync(absoluteDestination, 0o755);
  return true;
}

const missingOnly = process.argv.includes('--missing-only');
let imported = 0;
let existingSkipped = 0;
let contentExcluded = 0;
const contentExcludedPaths = [];
for (const repository of sourceRepositories) {
  const source = resolve(repositoryRoot, repository.source);
  const entries = readTree(source, repository.ref);
  const blobs = readBlobs(source, entries);
  entries.forEach((entry, index) => {
    const content = blobs[index];
    if (hasForbiddenContent(entry.path, content)) {
      contentExcluded += 1;
      contentExcludedPaths.push(`${repository.name}:${entry.path}`);
      return;
    }
    const written = writeEntry(mapDestination(repository.name, entry.path), entry, content);
    if (written) imported += 1;
    else existingSkipped += 1;
  });
}

process.stdout.write(
  `Imported ${imported} tracked files; skipped ${existingSkipped} existing files; excluded ${contentExcluded} files by content policy.\n`,
);
contentExcludedPaths.forEach((path) => process.stdout.write(`Excluded content: ${path}\n`));

#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import {
  forbiddenContentFragments,
  importForbiddenContentFragments,
} from './import-policy.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const ignoredFiles = new Set([
  '.gitignore',
  'ROADMAP.md',
  'scripts/import-policy.mjs',
  'scripts/import-sources.mjs',
  'scripts/scan-private-data.mjs',
]);
const binaryExtensions = new Set([
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.pdf',
  '.png',
  '.webp',
  '.woff',
  '.woff2',
]);
const forbiddenPaths = [
  /(^|\/)\.env(?:$|\.(?!example$))/,
  /(^|\/)key_gcp\.json$/,
  /(^|\/)(?:private|customer|user)-fixtures\//,
  /(^|\/)dataset\/(user|bdf|dataset_trattamenti)\//,
  /(^|\/)backups\/.*\.sql$/i,
];
const scanAllLocalFirstViolations = process.argv.includes('--full');
const deniedContent = scanAllLocalFirstViolations
  ? forbiddenContentFragments
  : importForbiddenContentFragments;

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: repositoryRoot,
  })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

function contentViolation(path) {
  if (ignoredFiles.has(path) || binaryExtensions.has(extname(path).toLowerCase())) return false;
  const absolutePath = resolve(repositoryRoot, path);
  if (!existsSync(absolutePath)) return false;
  const content = readFileSync(absolutePath, 'utf8');
  return deniedContent.some((fragment) => content.includes(fragment));
}

const violations = trackedFiles().filter(
  (path) => forbiddenPaths.some((pattern) => pattern.test(path)) || contentViolation(path),
);

if (violations.length > 0) {
  process.stderr.write(`Privacy scan failed for ${violations.length} path(s):\n`);
  violations.forEach((path) => process.stderr.write(`- ${path}\n`));
  process.exit(1);
}

process.stdout.write('Privacy scan passed.\n');

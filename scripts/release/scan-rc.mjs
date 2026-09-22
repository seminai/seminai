#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

function run(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: 'utf8' });
}

console.log('RC scan: filesystem privacy');
execFileSync('node', ['scripts/scan-private-data.mjs', '--full'], { cwd: root, stdio: 'inherit' });

console.log('RC scan: git history subjects');
const subjects = run('git', ['log', '--all', '--format=%s']);
if (/key_gcp|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}/.test(subjects)) {
  throw new Error('Suspicious secret pattern in commit subjects');
}

try {
  const inspect = run('docker', [
    'image',
    'inspect',
    'seminai:local',
    '--format',
    '{{.Id}} {{.Os}}/{{.Architecture}} {{.Size}}',
  ]);
  console.log(`RC scan: OCI image seminai:local ${inspect.trim()}`);
} catch {
  console.log('OCI image seminai:local is not present on this host.');
}

console.log('RC scan passed. No GitHub release or tag was created.');

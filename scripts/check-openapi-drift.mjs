#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
execSync('npm run swagger:export --workspace @seminai/backend', { cwd: root, stdio: 'inherit' });
execSync('git diff --exit-code -- backend/openapi/openapi.json backend/openapi/extract-api.json', {
  cwd: root,
  stdio: 'inherit',
});
console.log('OpenAPI specs match the exported contracts.');

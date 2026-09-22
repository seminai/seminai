#!/usr/bin/env node

import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const composeFile = path.join(rootDir, 'docker-compose.test.yml');
const projectName = process.env.SEMINAI_TEST_COMPOSE_PROJECT || 'seminai-be-v2-test';

const dbHost = process.env.SEMINAI_TEST_DB_HOST || '127.0.0.1';
const dbPort = process.env.SEMINAI_TEST_DB_PORT || '55432';
const redisHost = process.env.SEMINAI_TEST_REDIS_HOST || '127.0.0.1';
const redisPort = process.env.SEMINAI_TEST_REDIS_PORT || '56379';
const databaseUrl =
  process.env.TEST_DATABASE_URL ||
  `postgresql://postgres:postgres@${dbHost}:${dbPort}/seminai_test?schema=public&sslmode=disable`;
const redisUrl = process.env.TEST_REDIS_URL || `redis://${redisHost}:${redisPort}`;

const command = process.argv[2] || 'help';
const extraArgs = process.argv.slice(3);

const baseEnv = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  DIRECT_URL: databaseUrl,
  REDIS_URL: redisUrl,
  JWT_SECRET: process.env.JWT_SECRET || 'test-jwt-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',
  INVITE_CODE: process.env.INVITE_CODE || 'TEST_INVITE_CODE',
  EMAIL_TRANSPORT: 'json',
  EMAIL_USER: 'noreply@seminai.test',
  EMAIL_PASSWORD: 'test-email-password',
  SMTP_HOST: process.env.SMTP_HOST || '127.0.0.1',
  SMTP_PORT: process.env.SMTP_PORT || '1025',
};

const PUBLIC_FORBIDDEN_ENV = [
  'ANTHROPIC_API_KEY',
  'GCP_BUCKET_NAME',
  'GCP_PROJECT_ID',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'IMAGE_LINE_CLIENT_ID',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'PASSWORD_BDF',
  'QDC_TEST_CLIENT_ID',
  'RUN_LIVE_EXTRACTION_QUALITY',
  'TAVILY_API_KEY',
  'URL_SERVER_BDF',
  'USERNAME_BDF',
];

function publicEnv() {
  const env = { ...baseEnv };
  for (const name of PUBLIC_FORBIDDEN_ENV) delete env[name];
  return env;
}

function run(bin, args, options = {}) {
  const result = spawnSync(bin, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: options.env || baseEnv,
    shell: process.platform === 'win32',
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runStatus(bin, args, options = {}) {
  const result = spawnSync(bin, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: options.env || baseEnv,
    shell: process.platform === 'win32',
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

function compose(args) {
  run('docker', ['compose', '-p', projectName, '-f', composeFile, ...args]);
}

function waitForTcp(host, port, label, timeoutMs = 60000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host, port: Number(port) });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`${label} did not become reachable at ${host}:${port}`));
          return;
        }
        setTimeout(attempt, 1000);
      });
    };
    attempt();
  });
}

async function waitForServices() {
  await Promise.all([
    waitForTcp(dbHost, dbPort, 'PostgreSQL'),
    waitForTcp(redisHost, redisPort, 'Redis'),
  ]);
}

async function up() {
  compose(['up', '-d', 'postgres', 'redis']);
  await waitForServices();
}

function migrate() {
  const attempts = 5;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const status = runStatus('npx', ['prisma', 'migrate', 'deploy']);
    if (status === 0) return;
    if (attempt === attempts) process.exit(status);
    console.warn(`Prisma migrate failed on attempt ${attempt}/${attempts}; retrying...`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 1500);
  }
}

function jest(config, env = baseEnv) {
  run('npx', ['jest', '--config', config, '--watchman=false', '--runInBand', ...extraArgs], {
    env,
  });
}

async function runWithEnv(kind) {
  await up();
  migrate();
  if (kind === 'fast') {
    jest('jest.integration.fast.config.cjs');
    return;
  }
  if (kind === 'quality') {
    jest('jest.integration.quality.config.cjs');
    return;
  }
  if (kind === 'quality-live') {
    jest('jest.integration.quality.config.cjs', {
      ...baseEnv,
      RUN_LIVE_EXTRACTION_QUALITY: '1',
    });
    return;
  }
  if (kind === 'public') {
    jest('jest.integration.public.config.cjs', publicEnv());
    return;
  }
  if (kind === 'private') {
    jest('jest.integration.private.config.cjs', publicEnv());
    return;
  }
  if (kind === 'all') {
    jest('jest.integration.config.cjs');
  }
}

switch (command) {
  case 'up':
    await up();
    break;
  case 'down':
    compose(['down']);
    break;
  case 'reset':
    compose(['down', '-v']);
    await up();
    migrate();
    break;
  case 'migrate':
    await up();
    migrate();
    break;
  case 'test-fast':
    await runWithEnv('fast');
    break;
  case 'test-quality':
    await runWithEnv('quality');
    break;
  case 'test-quality-live':
    await runWithEnv('quality-live');
    break;
  case 'test-all':
    await runWithEnv('all');
    break;
  case 'test-public':
    await runWithEnv('public');
    break;
  case 'test-private':
    await runWithEnv('private');
    break;
  case 'status':
    compose(['ps']);
    break;
  default:
    console.log(`Usage: node scripts/test-env.mjs <command>

Commands:
  up                 Start PostgreSQL and Redis for tests
  down               Stop the test services
  reset              Recreate services and apply migrations
  migrate            Start services and apply Prisma migrations
  test-fast          Run FAST integration bucket
  test-quality       Run dataset extraction quality tests
  test-quality-live  Run quality tests including live OCR/LLM cases
  test-all           Run the full integration suite
  test-public        Run deterministic integration tests without private fixtures or live providers
  test-private       Inspect optional fixtures from SEMINAI_FIXTURES_DIR without logging metadata
  status             Show compose service status

Environment:
  DATABASE_URL=${databaseUrl}
  REDIS_URL=${redisUrl}`);
}

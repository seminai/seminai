import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { resolveDataDir } from './resolveDataDir';

const INVITE_FILE = 'invite';

function readInviteFile(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const value = readFileSync(path, 'utf8').trim();
  return value.length > 0 ? value : undefined;
}

function persistInvite(path: string, value: string): void {
  writeFileSync(path, `${value}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(path, 0o600);
}

/** Ensures a persistent invite code exists for SMTP-free, invite-only signup. */
export function bootstrapInviteCode(env: NodeJS.ProcessEnv = process.env): string {
  const secretsDir = join(resolveDataDir(env), 'secrets');
  mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
  const filePath = join(secretsDir, INVITE_FILE);
  const fromEnv = env.INVITE_CODE?.trim();
  if (fromEnv) {
    if (!existsSync(filePath)) persistInvite(filePath, fromEnv);
    env.INVITE_CODE = fromEnv;
    return fromEnv;
  }
  const fromFile = readInviteFile(filePath);
  if (fromFile) {
    env.INVITE_CODE = fromFile;
    return fromFile;
  }
  const generated = randomBytes(12).toString('hex');
  persistInvite(filePath, generated);
  env.INVITE_CODE = generated;
  return generated;
}

export function rotateInviteCode(env: NodeJS.ProcessEnv = process.env): string {
  const secretsDir = join(resolveDataDir(env), 'secrets');
  mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
  const generated = randomBytes(12).toString('hex');
  persistInvite(join(secretsDir, INVITE_FILE), generated);
  env.INVITE_CODE = generated;
  return generated;
}

import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { resolveDataDir } from './resolveDataDir';

const JWT_FILE = 'jwt';
const ENCRYPTION_FILE = 'encryption';
const MIN_SECRET_LENGTH = 32;

export interface BootstrappedSecrets {
  readonly jwtSecret: string;
  readonly encryptionSecret: string;
  readonly secretsDir: string;
}

function readSecretFile(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const value = readFileSync(path, 'utf8').trim();
  return value.length >= MIN_SECRET_LENGTH ? value : undefined;
}

function persistSecret(path: string, value: string): void {
  writeFileSync(path, `${value}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(path, 0o600);
}

function isUsableSecret(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length >= MIN_SECRET_LENGTH && !trimmed.includes('<');
}

function resolveOrCreateSecret(envValue: string | undefined, filePath: string): string {
  if (envValue && isUsableSecret(envValue)) {
    const trimmed = envValue.trim();
    if (!existsSync(filePath)) persistSecret(filePath, trimmed);
    return trimmed;
  }
  const fromFile = readSecretFile(filePath);
  if (fromFile) return fromFile;
  const generated = randomBytes(32).toString('hex');
  persistSecret(filePath, generated);
  return generated;
}

/**
 * Ensures JWT and AES secrets exist under DATA_DIR/secrets.
 * Precedence: environment > existing file > generate-and-persist.
 */
export function bootstrapInstanceSecrets(
  env: NodeJS.ProcessEnv = process.env,
): BootstrappedSecrets {
  const secretsDir = join(resolveDataDir(env), 'secrets');
  mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
  chmodSync(secretsDir, 0o700);

  const jwtSecret = resolveOrCreateSecret(env.JWT_SECRET, join(secretsDir, JWT_FILE));
  const encryptionSecret = resolveOrCreateSecret(
    env.ENCRYPTION_SECRET,
    join(secretsDir, ENCRYPTION_FILE),
  );

  env.JWT_SECRET = jwtSecret;
  env.ENCRYPTION_SECRET = encryptionSecret;
  return { jwtSecret, encryptionSecret, secretsDir };
}

import { resolve } from 'node:path';

/** Returns the instance data root (secrets, local files, backups). */
export function resolveDataDir(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return env.DATA_DIR || resolve(process.cwd(), 'data');
}

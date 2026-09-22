import { createHash, randomBytes } from 'node:crypto';

const API_KEY_PREFIX = 'sk_live_';

export function hashApiKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function generateApiKeySecret(): { readonly secret: string; readonly prefix: string } {
  const randomPart = randomBytes(24).toString('hex');
  const secret = `${API_KEY_PREFIX}${randomPart}`;
  const prefix = secret.slice(0, API_KEY_PREFIX.length + 8);
  return { secret, prefix };
}

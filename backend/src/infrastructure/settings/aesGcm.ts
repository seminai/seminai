import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function toBytes(value: Buffer | Uint8Array): Uint8Array {
  return Uint8Array.from(value);
}

function resolveAesKey(secret: string): Uint8Array {
  if (/^[0-9a-f]{64}$/i.test(secret)) {
    return toBytes(Buffer.from(secret, 'hex'));
  }
  return toBytes(createHash('sha256').update(secret).digest());
}

function concatToBuffer(parts: readonly Uint8Array[]): Buffer {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return Buffer.from(out);
}

/** Encrypts plaintext with AES-256-GCM. Payload format: ivHex:tagHex:cipherHex. */
export function encryptAesGcm(plaintext: string, secret: string): string {
  const iv = toBytes(randomBytes(IV_LENGTH));
  const cipher = createCipheriv(ALGORITHM, resolveAesKey(secret), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = concatToBuffer([
    toBytes(cipher.update(plaintext, 'utf8')),
    toBytes(cipher.final()),
  ]);
  const tag = toBytes(cipher.getAuthTag());
  return `${Buffer.from(iv).toString('hex')}:${Buffer.from(tag).toString('hex')}:${encrypted.toString('hex')}`;
}

/** Decrypts an AES-256-GCM payload produced by encryptAesGcm. */
export function decryptAesGcm(payload: string, secret: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    throw new Error('Malformed encrypted payload');
  }
  const [ivHex, tagHex, cipherHex] = parts;
  const decipher = createDecipheriv(
    ALGORITHM,
    resolveAesKey(secret),
    toBytes(Buffer.from(ivHex, 'hex')),
    { authTagLength: AUTH_TAG_LENGTH },
  );
  decipher.setAuthTag(toBytes(Buffer.from(tagHex, 'hex')));
  const decrypted = concatToBuffer([
    toBytes(decipher.update(toBytes(Buffer.from(cipherHex || '', 'hex')))),
    toBytes(decipher.final()),
  ]);
  return decrypted.toString('utf8');
}

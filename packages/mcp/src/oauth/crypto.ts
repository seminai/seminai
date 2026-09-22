import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function sha256Base64Url(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  const actual = sha256Base64Url(verifier);
  const left = Buffer.from(actual);
  const right = Buffer.from(challenge);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

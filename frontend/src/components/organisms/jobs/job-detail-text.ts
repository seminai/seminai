import { sanitizeUserFacingValue } from '@/lib/safe-display';

export function toText(value: unknown): string {
  return sanitizeUserFacingValue(value);
}

/**
 * First-party persistence of the user's cookie-consent decision.
 *
 * Stored in localStorage (strictly-necessary, allowed without consent). Kept in
 * its own dependency-free module so both `analytics.ts` (reads the decision at
 * boot) and `consent.ts` (writes it) can use it without an import cycle.
 *
 * `version` lets us re-prompt if the cookie policy materially changes.
 */
const STORAGE_KEY = 'seminai-cookie-consent';
const CONSENT_VERSION = 1;

export type ConsentStatus = 'granted' | 'denied';

interface StoredConsent {
  readonly status: ConsentStatus;
  readonly version: number;
  readonly timestamp: string;
}

/** Returns the persisted decision, or `null` if none (or a stale policy version). */
export function readStoredConsent(): ConsentStatus | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed.status === 'granted' || parsed.status === 'denied' ? parsed.status : null;
  } catch {
    return null;
  }
}

export function writeStoredConsent(status: ConsentStatus): void {
  try {
    const payload: StoredConsent = {
      status,
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function clearStoredConsent(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

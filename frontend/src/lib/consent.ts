import {
  readStoredConsent,
  writeStoredConsent,
  type ConsentStatus,
} from '@/lib/consent-storage';
import { grantAnalyticsConsent, revokeAnalyticsConsent } from '@/lib/analytics';

/**
 * Framework-agnostic cookie-consent store (vanilla module, mirrors the pattern
 * of `chat-stream-store.ts`). Drives both the consent banner and PostHog's
 * opt-in/opt-out. The banner is visible until the user makes a choice; the
 * choice is remembered, and can be reopened (GDPR withdrawal).
 */
interface ConsentState {
  readonly status: ConsentStatus | null;
  readonly isBannerVisible: boolean;
}

const initialStatus = readStoredConsent();
let state: ConsentState = {
  status: initialStatus,
  isBannerVisible: initialStatus === null,
};

const listeners = new Set<() => void>();

function setState(next: ConsentState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function getConsentSnapshot(): ConsentState {
  return state;
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** User accepted analytics cookies. */
export function acceptConsent(): void {
  writeStoredConsent('granted');
  grantAnalyticsConsent();
  setState({ status: 'granted', isBannerVisible: false });
}

/** User declined analytics cookies ("necessary only"). */
export function rejectConsent(): void {
  writeStoredConsent('denied');
  revokeAnalyticsConsent();
  setState({ status: 'denied', isBannerVisible: false });
}

/** Re-shows the banner so the user can change/withdraw a previous choice. */
export function reopenConsent(): void {
  setState({ ...state, isBannerVisible: true });
}

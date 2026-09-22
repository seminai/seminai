import { useSyncExternalStore } from 'react';
import {
  acceptConsent,
  getConsentSnapshot,
  rejectConsent,
  reopenConsent,
  subscribeConsent,
} from '@/lib/consent';

/**
 * React binding for the cookie-consent store. The action functions are stable
 * module-level references, so they are safe to use in deps/handlers.
 */
export function useConsent() {
  const snapshot = useSyncExternalStore(subscribeConsent, getConsentSnapshot, getConsentSnapshot);
  return {
    status: snapshot.status,
    isBannerVisible: snapshot.isBannerVisible,
    accept: acceptConsent,
    reject: rejectConsent,
    reopen: reopenConsent,
  } as const;
}

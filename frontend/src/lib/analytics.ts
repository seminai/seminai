import posthog from 'posthog-js';
import type { AnalyticsEvent, AnalyticsProps } from '@/lib/analytics-events';
import { readStoredConsent } from '@/lib/consent-storage';

/**
 * Thin, typed wrapper around `posthog-js` — the ONLY module that imports the
 * PostHog SDK directly. Capture strategy: explicit events + manual pageviews
 * only (no autocapture, no session replay). Hosted on PostHog EU Cloud.
 *
 * When `VITE_POSTHOG_KEY` is empty (local dev / CI), every function is a no-op
 * and the SDK is never initialised — no network calls, no console noise.
 *
 * GDPR: the SDK initialises opted-OUT with in-memory persistence, so it writes
 * no cookies and sends no events until the user grants consent (see
 * `grantAnalyticsConsent`). Consent is gated by the cookie banner.
 */

const DEFAULT_HOST = 'https://eu.i.posthog.com';

let initialized = false;
let isEnabled = false;

interface IdentifyInput {
  readonly id: string;
  readonly email?: string;
  readonly role?: string;
}

/**
 * Initialises PostHog once. Idempotent — safe under React 19 StrictMode and
 * repeated bootstrap imports. No-op when the project key is not configured.
 */
export function initAnalytics(): void {
  if (initialized) return;
  initialized = true;

  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) return;

  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST ?? DEFAULT_HOST,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: true,
    disable_session_recording: true,
    person_profiles: 'identified_only',
    // GDPR opt-in: no cookies/localStorage and no events until consent.
    persistence: 'memory',
    opt_out_capturing_by_default: true,
    opt_out_capturing_persistence_type: 'localStorage',
    loaded: (ph) => {
      if (import.meta.env.DEV) ph.debug();
    },
  });

  isEnabled = true;

  // Re-apply a previously granted consent on boot (returning visitor).
  if (readStoredConsent() === 'granted') applyOptIn();
}

/** Switches PostHog to persistent storage and starts capturing. */
function applyOptIn(): void {
  posthog.set_config({ persistence: 'localStorage+cookie' });
  posthog.opt_in_capturing();
}

/**
 * Enables analytics after the user accepts cookies: persists, opts in, and
 * fires a `$pageview` for the current page (suppressed before consent).
 */
export function grantAnalyticsConsent(): void {
  if (!isEnabled) return;
  applyOptIn();
  capturePageview(window.location.pathname);
}

/** Disables analytics on reject/withdrawal: opts out, keeps memory-only (no cookies). */
export function revokeAnalyticsConsent(): void {
  if (!isEnabled) return;
  posthog.opt_out_capturing();
}

/** Captures a typed product event. No-op when analytics is disabled. */
export function capture(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (!isEnabled) return;
  posthog.capture(event, props);
}

/** Fires a manual `$pageview` (PostHog reads the settled URL from the DOM). */
export function capturePageview(path: string): void {
  if (!isEnabled || !path) return;
  posthog.capture('$pageview', { $current_url: window.location.href, pathname: path });
}

/** Links subsequent events to the authenticated user (shared distinct_id with the BE). */
export function identifyUser(input: IdentifyInput): void {
  if (!isEnabled || !input.id) return;
  const personProps: Record<string, string> = {};
  if (input.email) personProps.email = input.email;
  if (input.role) personProps.role = input.role;
  posthog.identify(input.id, personProps);
}

/** Clears the identified user (call on logout). */
export function resetAnalytics(): void {
  if (!isEnabled) return;
  posthog.reset();
}

/** Associates the current user with a B2B group (company/workspace) for group analytics. */
export function setGroup(type: 'workspace', key: string, props?: AnalyticsProps): void {
  if (!isEnabled || !key) return;
  posthog.group(type, key, props);
}

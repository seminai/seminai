/// <reference types="vite/client" />

/**
 * Strongly-typed environment variables exposed to the app via `import.meta.env`.
 *
 * This interface MERGES with Vite's built-in `ImportMetaEnv`, so explicitly
 * listed keys are typed (`string`) instead of falling back to the loose
 * index signature — keeping access to `VITE_*` vars compliant with the
 * project's "no `any`" rule.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_COOKIE_POLICY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

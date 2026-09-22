declare global {
  interface Window {
    __API_BASE_URL__?: string;
  }
}

/**
 * Returns the API base URL injected at app bootstrap (see `main.tsx`).
 *
 * NOTE: this module intentionally does NOT read `import.meta.env` so that
 * `api-client.ts` (used as the orval mutator) can be bundled by esbuild
 * without triggering the `empty-import-meta` warning when esbuild's default
 * target (es2015) is used.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.__API_BASE_URL__) {
    return window.__API_BASE_URL__;
  }
  return '/api';
}

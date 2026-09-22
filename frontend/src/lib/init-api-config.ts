/**
 * Bootstraps runtime API configuration on the global `window` object.
 *
 * Must be the FIRST import in `main.tsx` so that `window.__API_BASE_URL__`
 * is set before any module that calls `getApiBaseUrl()` runs.
 *
 * Reading `import.meta.env` here is intentional and safe: this file is only
 * processed by Vite (target ES2023), not by esbuild via orval.
 */
window.__API_BASE_URL__ = import.meta.env.VITE_API_URL ?? '/api';

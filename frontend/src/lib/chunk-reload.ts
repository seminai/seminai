const FLAG_KEY = 'chunk-reload-attempted';

const CHUNK_ERROR_PATTERNS: readonly RegExp[] = [
  /Failed to fetch dynamically imported module/i,
  /Failed to load module script/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /ChunkLoadError/i,
] as const;

export function isChunkLoadError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? `${err.name} ${err.message}`
      : typeof err === 'string'
        ? err
        : '';
  if (!message) return false;
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(message));
}

export function attemptChunkReload(): boolean {
  try {
    if (sessionStorage.getItem(FLAG_KEY)) return false;
    sessionStorage.setItem(FLAG_KEY, '1');
  } catch {
    // sessionStorage may be unavailable; reload anyway, accept potential loop
  }
  window.location.reload();
  return true;
}

function clearFlag(): void {
  try {
    sessionStorage.removeItem(FLAG_KEY);
  } catch {
    // ignore
  }
}

export function installChunkReloadHandler(): void {
  window.addEventListener('vite:preloadError', (event: Event) => {
    event.preventDefault();
    attemptChunkReload();
  });

  window.addEventListener('error', (event: ErrorEvent) => {
    if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
      attemptChunkReload();
    }
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    if (isChunkLoadError(event.reason)) {
      attemptChunkReload();
    }
  });

  if (document.readyState === 'complete') {
    clearFlag();
  } else {
    window.addEventListener('load', () => {
      window.setTimeout(clearFlag, 1000);
    });
  }
}

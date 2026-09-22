process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

console.log('[BOOTSTRAP] Starting server...');
console.log('[BOOTSTRAP] NODE_ENV:', process.env.NODE_ENV);
console.log('[BOOTSTRAP] PORT:', process.env.PORT);
console.log('[BOOTSTRAP] DATABASE_URL set:', !!process.env.DATABASE_URL);
console.log('[BOOTSTRAP] UPSTASH_REDIS_REST_URL set:', !!process.env.UPSTASH_REDIS_REST_URL);
console.log('[BOOTSTRAP] UPSTASH_REDIS_REST_TOKEN set:', !!process.env.UPSTASH_REDIS_REST_TOKEN);

import('./server.js').catch((err) => {
  console.error('[BOOTSTRAP] Failed to load server module:', err);
  process.exit(1);
});

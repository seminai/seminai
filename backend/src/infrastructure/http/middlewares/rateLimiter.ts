import { Request, Response, NextFunction } from 'express';
import { getRedisConnection } from '../../queue/redis.connection';

/**
 * Rate Limiting Configuration (Redis-backed, distributed)
 *
 * Limiti per categoria di endpoint:
 * - DEFAULT: 1000 req/min per IP (endpoint generici) — alto per assorbire
 *   il fan-out di query TanStack al mount/login senza bloccare l'utente.
 * - JOB_STATUS: 1000 req/min per IP (polling frequente)
 * - START_JOB: 10 req/min per utente (protezione risorse pesanti)
 * - BULK_EXTRACT: 5 req/min per utente (estrazione etichette costosa)
 */
const DEFAULT_LIMIT = 1000;
const DEFAULT_TTL_SEC = 60;
const JOB_STATUS_LIMIT = 1000;
const START_JOB_LIMIT = 10;
const BULK_EXTRACT_LIMIT = 5;

/**
 * In development non applichiamo rate limiting: il polling della FE,
 * l'hot-reload e Swagger possono facilmente sforare i limiti e bloccare
 * l'intero ambiente locale per un minuto. In produzione resta attivo.
 */
const isRateLimitDisabled = (): boolean => process.env.NODE_ENV === 'development';

/**
 * Lua script for atomic increment + TTL set.
 * Returns the current request count after increment.
 * Only sets the TTL on the first request (when count == 1).
 */
const RATE_LIMIT_SCRIPT = `
local current = redis.call('incr', KEYS[1])
if current == 1 then
  redis.call('expire', KEYS[1], ARGV[1])
end
return current
`;

interface RateLimitConfig {
  readonly cacheKey: string;
  readonly limit: number;
  readonly ttlSec: number;
}

const JOB_STATUS_PATTERNS = [
  '/dosage-agent/job-status',
  '/dosage-agent/jobs',
  '/labels/job-status',
  '/conformity-checker/job-status',
  '/jobs/create-product-and-job/status',
  '/jobs/groups-summary',
  '/jobs/get-job-grouped-by-job-id',
  '/onboarding/extract/status',
];

const matchesAnyPattern = (path: string, patterns: readonly string[]): boolean => {
  return patterns.some((pattern) => path.includes(pattern));
};

const getRateLimitConfig = (req: Request): RateLimitConfig => {
  if (matchesAnyPattern(req.path, JOB_STATUS_PATTERNS)) {
    return { cacheKey: 'job-status', limit: JOB_STATUS_LIMIT, ttlSec: DEFAULT_TTL_SEC };
  }
  return { cacheKey: 'default', limit: DEFAULT_LIMIT, ttlSec: DEFAULT_TTL_SEC };
};

async function checkRateLimit(
  key: string,
  limit: number,
  ttlSec: number,
): Promise<{ allowed: boolean; current: number }> {
  try {
    const redis = getRedisConnection();
    const current = (await redis.eval(RATE_LIMIT_SCRIPT, 1, key, ttlSec)) as number;
    return { allowed: current <= limit, current };
  } catch {
    // Redis down — allow request (graceful degradation)
    return { allowed: true, current: 0 };
  }
}

function sendRateLimitResponse(
  res: Response,
  limit: number,
  ttlSec: number,
  category: string,
  identifier: string,
): Response {
  res.setHeader('Retry-After', ttlSec.toString());
  res.setHeader('X-RateLimit-Limit', limit.toString());
  res.setHeader('X-RateLimit-Remaining', '0');
  res.setHeader('X-RateLimit-Reset', (Date.now() + ttlSec * 1000).toString());
  console.warn(`[RATE-LIMIT] Exceeded for ${category}: ${identifier}`);
  return res.status(429).json({
    status: 'error',
    message: 'Too many requests. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: ttlSec,
  });
}

/**
 * Middleware globale di rate limiting basato su IP (Redis-backed).
 * Applicato a tutte le richieste prima dell'autenticazione.
 * Falls back to allowing requests if Redis is unavailable.
 */
export const rateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  if (isRateLimitDisabled()) {
    return next();
  }
  const { cacheKey, limit, ttlSec } = getRateLimitConfig(req);
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const key = `rl:${cacheKey}:ip:${ip}`;
  const { allowed, current } = await checkRateLimit(key, limit, ttlSec);
  if (!allowed) {
    return sendRateLimitResponse(res, limit, ttlSec, cacheKey, `ip:${ip}`);
  }
  res.setHeader('X-RateLimit-Limit', limit.toString());
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - current).toString());
  return next();
};

/**
 * Factory per creare middleware di rate limiting per utente autenticato.
 * Usato DOPO ensureAuthenticated per endpoint che avviano job pesanti.
 */
export const createUserRateLimiter = (
  limit: number,
  ttlSec: number = DEFAULT_TTL_SEC,
  category: string = 'custom',
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (isRateLimitDisabled()) {
      return next();
    }
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
        code: 'UNAUTHENTICATED',
      });
    }
    const key = `rl:${category}:user:${userId}`;
    const { allowed, current } = await checkRateLimit(key, limit, ttlSec);
    if (!allowed) {
      return sendRateLimitResponse(res, limit, ttlSec, category, `user:${userId}`);
    }
    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - current).toString());
    return next();
  };
};

/**
 * Factory per creare middleware di rate limiting basato su IP.
 * Usato per endpoint non autenticati (login, register, forgot-password).
 */
export const createIpRateLimiter = (
  limit: number,
  ttlSec: number = DEFAULT_TTL_SEC,
  category: string = 'custom-ip',
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (isRateLimitDisabled()) {
      return next();
    }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `rl:${category}:ip:${ip}`;
    const { allowed, current } = await checkRateLimit(key, limit, ttlSec);
    if (!allowed) {
      return sendRateLimitResponse(res, limit, ttlSec, category, `ip:${ip}`);
    }
    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - current).toString());
    return next();
  };
};

/**
 * Rate limiter pre-configurato per endpoint di autenticazione (10 req/min per IP)
 */
export const authRateLimiter = createIpRateLimiter(10, DEFAULT_TTL_SEC, 'auth');

/**
 * Rate limiter pre-configurato per endpoint che avviano job (10 req/min per utente)
 */
export const startJobRateLimiter = createUserRateLimiter(
  START_JOB_LIMIT,
  DEFAULT_TTL_SEC,
  'start-job',
);

/**
 * Rate limiter pre-configurato per endpoint di estrazione bulk (5 req/min per utente)
 */
export const bulkExtractRateLimiter = createUserRateLimiter(
  BULK_EXTRACT_LIMIT,
  DEFAULT_TTL_SEC,
  'bulk-extract',
);

/**
 * Rate limiter per Extraction API document endpoint (per API key hash).
 */
export const createApiKeyRateLimiter = (
  limit: number,
  ttlSec: number = DEFAULT_TTL_SEC,
  category: string = 'extraction-api',
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (isRateLimitDisabled()) {
      return next();
    }
    const rawKey = req.headers['x-api-key'];
    const apiKey = typeof rawKey === 'string' ? rawKey.trim() : 'anonymous';
    const key = `rl:${category}:key:${apiKey.slice(0, 16)}`;
    const { allowed, current } = await checkRateLimit(key, limit, ttlSec);
    if (!allowed) {
      return sendRateLimitResponse(res, limit, ttlSec, category, key);
    }
    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - current).toString());
    return next();
  };
};

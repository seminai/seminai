import { resolveRedisTarget } from '../redis.connection';

describe('resolveRedisTarget', () => {
  it('prefers REDIS_URL in production for self-hosted Compose', () => {
    expect(
      resolveRedisTarget({
        NODE_ENV: 'production',
        REDIS_URL: 'redis://redis:6379',
      }),
    ).toEqual({ url: 'redis://redis:6379' });
  });

  it('uses localhost Redis outside production when REDIS_URL is unset', () => {
    expect(resolveRedisTarget({ NODE_ENV: 'test' })).toEqual({
      url: 'redis://localhost:6379',
    });
  });

  it('requires Upstash credentials in production without REDIS_URL', () => {
    expect(() => resolveRedisTarget({ NODE_ENV: 'production' })).toThrow(/REDIS_URL or UPSTASH/);
  });
});

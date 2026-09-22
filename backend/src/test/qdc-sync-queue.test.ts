import { shouldRunCronSync } from '../infrastructure/queue/QdcSyncQueue';

jest.mock('../infrastructure/repositories/Prisma', () => ({ prisma: {} }));
jest.mock('../infrastructure/queue/redis.connection', () => ({ getRedisConnection: jest.fn() }));

describe('shouldRunCronSync', () => {
  it('runs only when the client id is set and at least one user opted in', () => {
    expect(shouldRunCronSync({ clientId: 'cid', enabledCount: 1 })).toBe(true);
    expect(shouldRunCronSync({ clientId: 'cid', enabledCount: 3 })).toBe(true);
  });

  it('skips when the client id is missing', () => {
    expect(shouldRunCronSync({ clientId: undefined, enabledCount: 5 })).toBe(false);
    expect(shouldRunCronSync({ clientId: '', enabledCount: 5 })).toBe(false);
  });

  it('skips when no user opted in', () => {
    expect(shouldRunCronSync({ clientId: 'cid', enabledCount: 0 })).toBe(false);
  });
});

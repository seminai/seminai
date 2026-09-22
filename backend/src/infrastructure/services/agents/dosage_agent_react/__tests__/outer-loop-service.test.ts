import { OuterLoopService } from '../outer-loop/outer-loop.service';
import type { OuterLoopPrismaDelegate } from '../outer-loop/outer-loop.service';

interface MockDb {
  outerLoopTrigger: Record<string, ReturnType<typeof mockFn>>;
  _mocks: {
    create: ReturnType<typeof mockFn>;
    findUnique: ReturnType<typeof mockFn>;
    update: ReturnType<typeof mockFn>;
    findMany: ReturnType<typeof mockFn>;
    deleteMany: ReturnType<typeof mockFn>;
  };
}

function createMockDb(): MockDb {
  const create = mockFn();
  const findUnique = mockFn();
  const update = mockFn();
  const findMany = mockFn();
  const deleteMany = mockFn();
  return {
    outerLoopTrigger: { create, findUnique, update, findMany, deleteMany },
    _mocks: { create, findUnique, update, findMany, deleteMany },
  };
}

/** Simple mock function compatible with both bun and jest */
function mockFn() {
  let impl: ((...args: unknown[]) => unknown) | undefined;
  const calls: unknown[][] = [];
  const fn = (...args: unknown[]) => {
    calls.push(args);
    if (impl) return impl(...args);
    return undefined;
  };
  fn.mockResolvedValue = (val: unknown) => {
    impl = () => Promise.resolve(val);
    return fn;
  };
  fn.calls = calls;
  return fn;
}

describe('OuterLoopService', () => {
  describe('scheduleAlert', () => {
    it('creates a trigger with status pending', async () => {
      const db = createMockDb();
      const mockRow = {
        id: 'trigger-1',
        userId: 'user-1',
        type: 'stock_alert',
        title: 'Low stock',
        payload: { productId: 'p1' },
        scheduledAt: new Date('2026-05-01'),
        executedAt: null,
        status: 'pending',
        threadId: 'thread-1',
      };
      db._mocks.create.mockResolvedValue(mockRow);
      const service = new OuterLoopService(db as unknown as OuterLoopPrismaDelegate);

      const result = await service.scheduleAlert({
        userId: 'user-1',
        type: 'stock_alert',
        title: 'Low stock',
        payload: { productId: 'p1' },
        scheduledAt: new Date('2026-05-01'),
        threadId: 'thread-1',
      });

      expect(result.id).toBe('trigger-1');
      expect(result.status).toBe('pending');
      expect(db._mocks.create.calls).toHaveLength(1);
      const createArg = db._mocks.create.calls[0][0] as { data: Record<string, unknown> };
      expect(createArg.data.userId).toBe('user-1');
      expect(createArg.data.status).toBe('pending');
    });
  });

  describe('cancelAlert', () => {
    it('sets status to dismissed', async () => {
      const db = createMockDb();
      db._mocks.findUnique.mockResolvedValue({ id: 'trigger-1', userId: 'user-1' });
      db._mocks.update.mockResolvedValue({});
      const service = new OuterLoopService(db as unknown as OuterLoopPrismaDelegate);

      await service.cancelAlert('trigger-1', 'user-1');

      expect(db._mocks.update.calls).toHaveLength(1);
      const updateArg = db._mocks.update.calls[0][0] as { data: { status: string } };
      expect(updateArg.data.status).toBe('dismissed');
    });

    it('throws if trigger not found', async () => {
      const db = createMockDb();
      db._mocks.findUnique.mockResolvedValue(null);
      const service = new OuterLoopService(db as unknown as OuterLoopPrismaDelegate);

      await expect(service.cancelAlert('nope', 'user-1')).rejects.toThrow();
    });

    it('throws if user not authorized', async () => {
      const db = createMockDb();
      db._mocks.findUnique.mockResolvedValue({ id: 'trigger-1', userId: 'other-user' });
      const service = new OuterLoopService(db as unknown as OuterLoopPrismaDelegate);

      await expect(service.cancelAlert('trigger-1', 'user-1')).rejects.toThrow();
    });
  });

  describe('listPendingTriggers', () => {
    it('returns triggers with scheduledAt <= now', async () => {
      const db = createMockDb();
      db._mocks.findMany.mockResolvedValue([
        {
          id: 't1',
          userId: 'user-1',
          type: 'phenological',
          title: 'Phase change',
          payload: {},
          scheduledAt: new Date(),
          executedAt: null,
          status: 'pending',
          threadId: null,
        },
      ]);
      const service = new OuterLoopService(db as unknown as OuterLoopPrismaDelegate);

      const result = await service.listPendingTriggers('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('phenological');
    });
  });

  describe('executeAlert', () => {
    it('sets status to sent and executedAt', async () => {
      const db = createMockDb();
      const now = new Date();
      db._mocks.update.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        type: 'stock_alert',
        title: 'Low',
        payload: {},
        scheduledAt: now,
        executedAt: now,
        status: 'sent',
        threadId: null,
      });
      const service = new OuterLoopService(db as unknown as OuterLoopPrismaDelegate);

      const result = await service.executeAlert('t1');

      expect(result.status).toBe('sent');
    });
  });

  describe('deleteTriggersForUser', () => {
    it('deletes all triggers for user', async () => {
      const db = createMockDb();
      db._mocks.deleteMany.mockResolvedValue({ count: 5 });
      const service = new OuterLoopService(db as unknown as OuterLoopPrismaDelegate);

      const result = await service.deleteTriggersForUser('user-1');

      expect(result).toBe(5);
    });
  });
});

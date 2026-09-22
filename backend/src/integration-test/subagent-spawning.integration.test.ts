import {
  getWorkingMemory,
  clearWorkingMemory,
  updateWorkingMemoryAsync,
  withWorkingMemoryLock,
} from '../infrastructure/services/agents/dosage_agent_react/working-memory';

function uniqueThreadId(): string {
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// NOTE: the two original `spawn_subagent` placeholder cases were removed in
// PR-K of P2 — the tool now enqueues a real BullMQ job (see
// `__tests__/spawnSubagent.test.ts` and
// `integration-test/spawn-subagent-bullmq.integration.test.ts`). The two
// working-memory concurrency cases below are independent and stay here.
describe('working memory integration', () => {
  let threadId: string;

  beforeEach(() => {
    threadId = uniqueThreadId();
  });

  afterEach(() => {
    clearWorkingMemory(threadId);
  });

  it('working memory concurrent updates do not conflict', async () => {
    await Promise.all([
      withWorkingMemoryLock(threadId, (mem) => {
        Object.assign(mem, { expandedUnits: ['unit-A'] });
      }),
      withWorkingMemoryLock(threadId, (mem) => {
        Object.assign(mem, { inputProducts: ['prod-X'] });
      }),
    ]);
    const mem = getWorkingMemory(threadId);
    expect(mem.expandedUnits).toEqual(['unit-A']);
    expect(mem.inputProducts).toEqual(['prod-X']);
  });

  it('updateWorkingMemoryAsync merges correctly', async () => {
    type WM =
      import('../infrastructure/services/agents/dosage_agent_react/type/state').WorkingMemory;
    const mockMatched = [{ unitProductionId: 'u1', products: [{ name: 'Mancozeb' }] }];
    const mockDosage = [{ unitProductionId: 'u1', products: [{ name: 'Mancozeb' }] }];
    await updateWorkingMemoryAsync(
      threadId,
      () => ({ matchedProducts: mockMatched }) as unknown as Partial<WM>,
    );
    await updateWorkingMemoryAsync(
      threadId,
      () => ({ dosageResults: mockDosage }) as unknown as Partial<WM>,
    );
    const mem = getWorkingMemory(threadId);
    expect(mem.matchedProducts).toHaveLength(1);
    expect(mem.matchedProducts![0]).toMatchObject({ unitProductionId: 'u1' });
    expect(mem.dosageResults).toHaveLength(1);
    expect(mem.dosageResults![0]).toMatchObject({ unitProductionId: 'u1' });
  });
});

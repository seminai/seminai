import { forkBeforeGuard } from '../graph/fork-at-rejection';
import type { AgentApp } from '../DosageReactAgent';

describe('forkBeforeGuard', () => {
  function createMockApp(
    historySnapshots: Array<{
      next: string[];
      config?: { configurable?: { checkpoint_id?: string } };
    }>,
  ): AgentApp {
    return {
      getStateHistory: jest.fn().mockImplementation(function* () {
        for (const snapshot of historySnapshots) {
          yield snapshot;
        }
      }),
      updateState: jest.fn().mockResolvedValue({
        configurable: { thread_id: 'thread-1', checkpoint_id: 'fork-123' },
      }),
    } as unknown as AgentApp;
  }

  it('finds pre-guard checkpoint and creates fork', async () => {
    const app = createMockApp([
      { next: ['tools'], config: { configurable: { checkpoint_id: 'cp-2' } } },
      { next: ['guard'], config: { configurable: { checkpoint_id: 'cp-1' } } },
    ]);

    const result = await forkBeforeGuard({
      app,
      threadId: 'thread-1',
      rejectionReason: 'Too many items',
    });

    expect(result).toBeDefined();
    expect(result!.sourceCheckpointId).toBe('cp-1');
    expect(app.updateState).toHaveBeenCalledWith(
      expect.objectContaining({ configurable: { checkpoint_id: 'cp-1' } }),
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('Too many items'),
          }),
        ]),
      }),
      'taskPlanner',
    );
  });

  it('returns undefined when no pre-guard checkpoint found', async () => {
    const app = createMockApp([
      { next: ['tools'], config: { configurable: { checkpoint_id: 'cp-2' } } },
      { next: ['agent'], config: { configurable: { checkpoint_id: 'cp-1' } } },
    ]);

    const result = await forkBeforeGuard({
      app,
      threadId: 'thread-1',
      rejectionReason: 'Wrong approach',
    });

    expect(result).toBeUndefined();
    expect(app.updateState).not.toHaveBeenCalled();
  });

  it('returns undefined for empty history', async () => {
    const app = createMockApp([]);

    const result = await forkBeforeGuard({
      app,
      threadId: 'thread-1',
      rejectionReason: 'No history',
    });

    expect(result).toBeUndefined();
  });

  it('injects rejection message with DO NOT repeat instruction', async () => {
    const app = createMockApp([
      { next: ['guard'], config: { configurable: { checkpoint_id: 'cp-1' } } },
    ]);

    await forkBeforeGuard({
      app,
      threadId: 'thread-1',
      rejectionReason: 'User wants smaller batch',
    });

    const updateCall = (app.updateState as jest.Mock).mock.calls[0];
    const injectedMessages = updateCall[1].messages;
    const content = injectedMessages[0].content as string;
    expect(content).toContain('REJECTION FEEDBACK');
    expect(content).toContain('User wants smaller batch');
    expect(content).toContain('Do NOT repeat');
  });
});

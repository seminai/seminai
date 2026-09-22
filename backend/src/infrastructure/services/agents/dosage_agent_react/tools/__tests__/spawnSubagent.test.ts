/**
 * Unit tests for the new spawn_subagent tool behaviour (PR-K of P2).
 * The tool replaces the previous NO-OP placeholder with a real BullMQ
 * enqueue. We assert:
 *   1. SKIP_QUEUE=true short-circuits to a `disabled` reply (no queue call).
 *   2. Default mode enqueues a job and keeps the jobId out of user-facing text.
 */
import { createSpawnSubagentTool } from '../spawn-subagent.tool';
import { getDosageSubagentQueue } from '../../../../../queue/DosageSubagentQueue';
import { getWorkingMemory } from '../../working-memory';

const mockAddJob = jest.fn();

jest.mock('../../../../../queue/DosageSubagentQueue', () => ({
  getDosageSubagentQueue: jest.fn(() => ({ addJob: mockAddJob })),
}));

jest.mock('../../working-memory', () => ({
  getWorkingMemory: jest.fn(),
}));

const ORIGINAL_ENV = { ...process.env };

describe('spawn_subagent tool (PR-K)', () => {
  beforeEach(() => {
    mockAddJob.mockReset().mockResolvedValue('job-abc-123');
    (getDosageSubagentQueue as jest.Mock).mockReturnValue({ addJob: mockAddJob });
    (getWorkingMemory as jest.Mock).mockReset().mockReturnValue({
      inputUnits: [
        { id: 'u1', cropName: 'Vite' },
        { id: 'u2', cropName: 'Vite' },
      ],
      inputProducts: [{ productName: 'Rame Bordolese' }],
    });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('SKIP_QUEUE=true short-circuits to a disabled reply without touching the queue', async () => {
    process.env.SKIP_QUEUE = 'true';

    const tool = createSpawnSubagentTool('thread-1', 'user-1');
    const raw = await tool.invoke({
      task: 'Calculate dosages',
      unitIds: ['u1'],
      products: [{ name: 'Rame' }],
      strategy: 'avg' as const,
    });
    const out = JSON.parse(raw);

    expect(out.status).toBe('disabled');
    expect(mockAddJob).not.toHaveBeenCalled();
  });

  it('default mode enqueues the job and keeps the BullMQ jobId out of the message', async () => {
    delete process.env.SKIP_QUEUE;

    const tool = createSpawnSubagentTool('thread-1', 'user-1');
    const raw = await tool.invoke({
      task: 'Calculate dosages',
      unitIds: ['u1', 'u2'],
      products: [{ name: 'Rame' }],
      strategy: 'avg' as const,
    });
    const out = JSON.parse(raw);

    expect(out.status).toBe('queued');
    expect(out.subAgentJobId).toBe('job-abc-123');
    expect(out.message).not.toContain('job-abc-123');
    expect(out.unitCount).toBe(2);
    expect(out.productCount).toBe(1);
    expect(mockAddJob).toHaveBeenCalledTimes(1);
    expect(mockAddJob).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-1',
        userId: 'user-1',
        task: 'Calculate dosages',
        input: expect.objectContaining({
          strategy: 'avg',
          unitOfProduction: expect.arrayContaining([
            expect.objectContaining({ id: 'u1' }),
            expect.objectContaining({ id: 'u2' }),
          ]),
        }),
      }),
    );
  });

  it('returns an error when working memory has no units to delegate', async () => {
    delete process.env.SKIP_QUEUE;
    (getWorkingMemory as jest.Mock).mockReturnValue({ inputUnits: [], inputProducts: [] });

    const tool = createSpawnSubagentTool('thread-1', 'user-1');
    const raw = await tool.invoke({
      task: 'Calculate dosages',
      strategy: 'avg' as const,
    });
    const out = JSON.parse(raw);

    expect(out.status).toBe('error');
    expect(out.error).toMatch(/Nessuna unità di produzione/);
    expect(mockAddJob).not.toHaveBeenCalled();
  });
});

const mockAddJob = jest.fn();
const mockUpdateStatus = jest.fn();
const mockFindChat = jest.fn();

jest.mock('../../../../queue/DosageAgentQueue', () => ({
  getDosageAgentQueue: () => ({
    addJob: mockAddJob,
  }),
}));

jest.mock('../../../../repositories/PrismaDosageAgentJobRepository', () => ({
  PrismaDosageAgentJobRepository: jest.fn().mockImplementation(() => ({
    updateStatus: mockUpdateStatus,
  })),
}));

jest.mock('../../../../repositories/Prisma', () => ({
  prisma: {
    chat: {
      findUnique: mockFindChat,
    },
  },
}));

import { createStartDosageAgentJobTool } from '../tools/start-dosage-agent-job.tool';
import { clearWorkingMemory, updateWorkingMemory, getWorkingMemory } from '../working-memory';

describe('start_dosage_agent_job', () => {
  const threadId = 'dosage-start-thread';
  const userId = 'user-123';

  beforeEach(() => {
    clearWorkingMemory(threadId);
    jest.clearAllMocks();
    mockFindChat.mockResolvedValue(null);
  });

  it('returns error when inputProducts is missing', async () => {
    updateWorkingMemory(threadId, { inputUnits: [{ id: 'u1' }] });
    const tool = createStartDosageAgentJobTool(threadId, userId);

    const result = JSON.parse(await tool.func({}));

    expect(result.error).toBeDefined();
    expect(result.hint).toContain('list_company_products');
    expect(mockAddJob).not.toHaveBeenCalled();
  });

  it('returns error when inputUnits is missing', async () => {
    updateWorkingMemory(threadId, {
      inputProducts: [{ productName: 'Captano', registrationNumber: '3872' }],
    });
    const tool = createStartDosageAgentJobTool(threadId, userId);

    const result = JSON.parse(await tool.func({}));

    expect(result.error).toBeDefined();
    expect(result.hint).toContain('list_production_units');
    expect(mockAddJob).not.toHaveBeenCalled();
  });

  it('returns prerequisite error when inputProducts is empty array', async () => {
    updateWorkingMemory(threadId, {
      inputProducts: [],
      inputUnits: [{ id: 'u1' }],
    });
    const tool = createStartDosageAgentJobTool(threadId, userId);

    const result = JSON.parse(await tool.func({}));

    expect(result.error).toContain('inputProducts');
    expect(mockAddJob).not.toHaveBeenCalled();
  });

  it('returns prerequisite error when inputUnits is empty array', async () => {
    updateWorkingMemory(threadId, {
      inputProducts: [{ productName: 'Captano' }],
      inputUnits: [],
    });
    const tool = createStartDosageAgentJobTool(threadId, userId);

    const result = JSON.parse(await tool.func({}));

    expect(result.error).toContain('inputUnits');
    expect(mockAddJob).not.toHaveBeenCalled();
  });

  it('enqueues job, keeps jobId internal, and returns user-safe status text', async () => {
    mockAddJob.mockResolvedValue('job-abc-123');
    mockUpdateStatus.mockResolvedValue(undefined);

    updateWorkingMemory(threadId, {
      inputProducts: [{ productName: 'Captano', registrationNumber: '3872', quantity: 10 }],
      inputUnits: [{ id: 'unit-1', cropName: 'Melo', areaHa: 5 }],
    });

    const tool = createStartDosageAgentJobTool(threadId, userId);
    const result = JSON.parse(await tool.func({}));

    expect(result.jobId).toBe('job-abc-123');
    expect(result.status).toBe('QUEUED');
    expect(result.productsCount).toBe(1);
    expect(result.unitsCount).toBe(1);
    expect(result.strategy).toBe('avg');
    expect(result.message).not.toContain('job-abc-123');
    expect(result.hint).not.toContain('jobId');
    expect(mockAddJob).toHaveBeenCalledTimes(1);
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-abc-123',
        userId,
      }),
    );
  });

  it('passes orchestrator params correctly', async () => {
    mockAddJob.mockResolvedValue('job-xyz-456');
    mockUpdateStatus.mockResolvedValue(undefined);

    updateWorkingMemory(threadId, {
      inputProducts: [{ productName: 'Leopard', quantity: 20 }],
      inputUnits: [{ id: 'unit-2', cropName: 'Vite', areaHa: 8 }],
    });

    const tool = createStartDosageAgentJobTool(threadId, userId);
    const result = JSON.parse(
      await tool.func({
        strategy: 'max',
        startAt: '2025-04-01',
        endAt: '2025-09-30',
        outStockLimiter: true,
        objective: 'maximize_coverage',
        intensity: 'high',
        priorityTargets: ['Peronospora', 'Oidio'],
        agronomicNotes: 'Pressione oidio alta',
      }),
    );

    expect(result.jobId).toBe('job-xyz-456');
    expect(result.strategy).toBe('max');
    expect(result.orchestrator).toEqual(
      expect.objectContaining({
        objective: 'maximize_coverage',
        intensity: 'high',
        priorityTargets: ['Peronospora', 'Oidio'],
        agronomicNotes: 'Pressione oidio alta',
      }),
    );

    const addJobCall = mockAddJob.mock.calls[0][0];
    expect(addJobCall.input.strategy).toBe('max');
    expect(addJobCall.input.outStockLimiter).toBe(true);
    expect(addJobCall.input.startAt).toBe('2025-04-01');
    expect(addJobCall.input.endAt).toBe('2025-09-30');
    expect(addJobCall.input.orchestrator.objective).toBe('maximize_coverage');
  });

  it('uses only selectedProducts when explicit products are requested', async () => {
    mockAddJob.mockResolvedValue('job-selected-123');
    mockUpdateStatus.mockResolvedValue(undefined);

    updateWorkingMemory(threadId, {
      inputProducts: [
        { productName: 'QUADRIS', registrationNumber: '009210', quantity: 20 },
        { productName: 'TAIFUN', registrationNumber: '010392', quantity: 15 },
        { productName: 'EVADE', registrationNumber: '006326', quantity: 10 },
        { productName: 'ALIETTE', registrationNumber: '004710', quantity: 99 },
      ],
      inputUnits: [{ id: 'unit-vite', cropName: 'Vite', areaHa: 3 }],
    });

    const tool = createStartDosageAgentJobTool(threadId, userId);
    const result = JSON.parse(
      await tool.func({
        selectedProducts: [
          { productName: 'QUADRIS', quantity: 1.2, quantityUnitOfMeasure: 'kg' },
          { productName: 'TAIFUN', quantity: 1, quantityUnitOfMeasure: 'kg' },
          { productName: 'EVADE', quantity: 1, quantityUnitOfMeasure: 'L' },
        ],
      }),
    );

    expect(result.productsCount).toBe(3);
    expect(result.selectedProducts).toEqual(['QUADRIS', 'TAIFUN', 'EVADE']);
    const addJobCall = mockAddJob.mock.calls[0][0];
    expect(addJobCall.input.products).toEqual([
      expect.objectContaining({
        productName: 'QUADRIS',
        quantity: 1.2,
        quantityUnitOfMeasure: 'kg',
      }),
      expect.objectContaining({ productName: 'TAIFUN', quantity: 1, quantityUnitOfMeasure: 'kg' }),
      expect.objectContaining({ productName: 'EVADE', quantity: 1, quantityUnitOfMeasure: 'L' }),
    ]);
  });

  it('infers requested products from the latest user message after approval', async () => {
    mockAddJob.mockResolvedValue('job-inferred-123');
    mockUpdateStatus.mockResolvedValue(undefined);
    mockFindChat.mockResolvedValue({
      messages: [
        { content: 'User approved the pending tool execution.' },
        { content: 'Crea un piano per QUADRIS - 1.2 kg TAIFUN - 1 kg EVADE - 1 L' },
      ],
    });

    updateWorkingMemory(threadId, {
      inputProducts: [
        { productName: 'QUADRIS', registrationNumber: '009210', quantity: 20 },
        { productName: 'TAIFUN', registrationNumber: '010392', quantity: 15 },
        { productName: 'EVADE', registrationNumber: '006326', quantity: 10 },
        { productName: 'ALIETTE', registrationNumber: '004710', quantity: 99 },
      ],
      inputUnits: [{ id: 'unit-vite', cropName: 'Vite', areaHa: 3 }],
    });

    const tool = createStartDosageAgentJobTool(threadId, userId);
    const result = JSON.parse(await tool.func({}));

    expect(result.productsCount).toBe(3);
    expect(result.selectedProducts).toEqual(['QUADRIS', 'TAIFUN', 'EVADE']);
    const addJobCall = mockAddJob.mock.calls[0][0];
    expect(
      addJobCall.input.products.map((product: { productName: string }) => product.productName),
    ).toEqual(['QUADRIS', 'TAIFUN', 'EVADE']);
  });

  it('maps field region and city from working memory onto the job input', async () => {
    mockAddJob.mockResolvedValue('job-zone-1');
    mockUpdateStatus.mockResolvedValue(undefined);

    updateWorkingMemory(threadId, {
      inputProducts: [{ productName: 'Captano', registrationNumber: '3872', quantity: 10 }],
      inputUnits: [
        {
          id: 'unit-1',
          cropName: 'Pero',
          variety: 'ABATE FETEL',
          field: { region: 'Emilia-Romagna', city: 'Riva del Po' },
        },
      ],
    });

    const tool = createStartDosageAgentJobTool(threadId, userId);
    await tool.func({});

    const addJobCall = mockAddJob.mock.calls[0][0] as {
      input: {
        unitOfProduction: Array<{ region?: string; city?: string; disciplinari?: string[] }>;
      };
    };
    expect(addJobCall.input.unitOfProduction[0]).toEqual(
      expect.objectContaining({
        region: 'Emilia-Romagna',
        city: 'Riva del Po',
        disciplinari: ['Emilia-Romagna'],
      }),
    );
  });

  it('saves jobId and preferences in working memory', async () => {
    mockAddJob.mockResolvedValue('job-mem-789');
    mockUpdateStatus.mockResolvedValue(undefined);

    updateWorkingMemory(threadId, {
      inputProducts: [{ productName: 'Captano', quantity: 5 }],
      inputUnits: [{ id: 'u1', cropName: 'Melo' }],
    });

    const tool = createStartDosageAgentJobTool(threadId, userId);
    await tool.func({ strategy: 'min', agronomicNotes: 'Test note' });

    const wm = getWorkingMemory(threadId);
    expect(wm.dosageJobId).toBe('job-mem-789');
    expect(wm.planningPreferences?.strategy).toBe('min');
    expect(wm.planningPreferences?.agronomicNotes).toBe('Test note');
  });
});

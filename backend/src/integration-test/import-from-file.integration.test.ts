import { createTestUser, prisma, type ITestUser } from './helpers';
import { createImportFromFileTool } from '../infrastructure/services/agents/dosage_agent_react/tools/import-from-file.tool';
import {
  updateWorkingMemory,
  clearWorkingMemory,
} from '../infrastructure/services/agents/dosage_agent_react/working-memory';

describe('import_from_file integration', () => {
  let testUser: ITestUser;

  beforeAll(async () => {
    testUser = await createTestUser();
  });

  afterEach(async () => {
    await prisma.field.deleteMany({
      where: { company: { vatNumber: { startsWith: '900' } } },
    });
    await prisma.userOnCompany.deleteMany({
      where: { company: { vatNumber: { startsWith: '900' } } },
    });
    await prisma.company.deleteMany({
      where: { vatNumber: { startsWith: '900' } },
    });
  });

  it('rolls back company and field creation when production unit validation fails', async () => {
    const threadId = `import-${Date.now()}`;
    const vatNumber = `900${String(Date.now()).slice(-8)}`;
    const fiscalCode = `IMPORT${String(Date.now()).slice(-10)}`.padEnd(16, 'X').slice(0, 16);

    updateWorkingMemory(threadId, {
      extractedFileData: {
        companies: [
          {
            name: 'Rollback Farm',
            vatNumber,
            fiscalCode,
            cuaa: null,
            nation: 'IT',
            region: 'Lazio',
            city: 'Roma',
            address: 'Via Test 1',
            cap: '00100',
          },
        ],
        fields: [
          {
            name: 'Campo 1',
            foglio: '10',
            particella: '20',
            comune: 'Roma',
            superficieCatastaleMq: 1000,
          },
        ],
        productionUnits: [
          {
            name: 'UP invalida',
            fieldIndex: 0,
          },
        ],
      },
    });

    const tool = createImportFromFileTool(threadId, testUser.id);
    const result = await tool.invoke({
      createCompany: true,
      importFields: true,
      importProductionUnits: true,
    });
    const parsed = JSON.parse(result as string);

    expect(parsed.error).toContain('Import validation failed');
    expect(await prisma.company.findFirst({ where: { vatNumber } })).toBeNull();
    expect(
      await prisma.field.count({
        where: { company: { vatNumber } },
      }),
    ).toBe(0);
    clearWorkingMemory(threadId);
  });
});

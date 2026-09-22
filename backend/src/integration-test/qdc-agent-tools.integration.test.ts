import { prisma } from './setup';
import { createTestUser, deleteTestUser } from './helpers';
import { PrismaSettingsRepository } from '../infrastructure/repositories/PrismaSettingsRepository';
import { Settings } from '../domain/entities/Settings';
import { createQdcListCompaniesTool } from '../infrastructure/services/agents/dosage_agent_react/tools/qdc/qdc-list-companies.tool';
import { createQdcGetOperationsTool } from '../infrastructure/services/agents/dosage_agent_react/tools/qdc/qdc-get-operations.tool';
import { classifyRisk } from '../infrastructure/services/agents/dosage_agent_react/graph/risk-classifier';

// SAFETY: this suite only exercises READ-ONLY tools. QDC data is the farmer's
// OFFICIAL field logbook: never add write-tool tests except against the
// dedicated test company (e.g. "AZIENDA PROVA").
const clientId = process.env.QDC_TEST_CLIENT_ID || process.env.IMAGE_LINE_CLIENT_ID;
const describeOrSkip = clientId ? describe : describe.skip;

async function ensureSettingsWithQdcKey(userId: string, qdcApiKey: string | null): Promise<void> {
  const repo = new PrismaSettingsRepository(prisma);
  const existing = await repo.findByUserId(userId);
  if (!existing) {
    await repo.create(
      Settings.create({
        userId,
        language: 'it',
        qdcApiKey,
        ifarmingApiKey: null,
        whatsappInstanceName: null,
        whatsappApiKey: null,
        whatsappInstanceId: null,
        whatsappConnected: false,
        whatsappPhoneNumber: null,
        whatsappQrCode: null,
        whatsappLastSync: null,
        whatsappAllowedNumbers: [],
        openMeteoEnabled: false,
      }),
    );
    return;
  }
  await repo.update(existing.id, { qdcApiKey });
}

describeOrSkip('QDC agent tools — DB + real QDC API', () => {
  jest.setTimeout(90_000);
  let userId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
  });

  afterAll(async () => {
    await deleteTestUser();
  });

  it('classifies the QDC tools as low risk (no approval required)', () => {
    const expectedLevel = 'low';
    expect(classifyRisk('qdc_list_companies', {}).level).toBe(expectedLevel);
    expect(classifyRisk('qdc_get_operations', {}).level).toBe(expectedLevel);
    expect(classifyRisk('qdc_get_giacenze', {}).level).toBe(expectedLevel);
  });

  it('fails soft with a structured message when the QDC key is not configured', async () => {
    const savedEnvClientId = process.env.IMAGE_LINE_CLIENT_ID;
    delete process.env.IMAGE_LINE_CLIENT_ID;
    try {
      await ensureSettingsWithQdcKey(userId, null);
      const tool = createQdcListCompaniesTool(userId);
      const actualOutput = JSON.parse(await tool.invoke({ includiDisabilitate: false }));
      expect(actualOutput.available).toBe(false);
      expect(actualOutput.reason).toContain('Quaderno di Campagna');
    } finally {
      if (savedEnvClientId !== undefined) {
        process.env.IMAGE_LINE_CLIENT_ID = savedEnvClientId;
      }
    }
  });

  it('lists real license companies and reads their treatments from the QDC API', async () => {
    await ensureSettingsWithQdcKey(userId, clientId!);
    const listTool = createQdcListCompaniesTool(userId);
    const actualCompanies = JSON.parse(await listTool.invoke({ includiDisabilitate: false }));
    expect(actualCompanies.available).toBe(true);
    expect(Array.isArray(actualCompanies.companies)).toBe(true);
    console.log('[qdc] tool companies:', JSON.stringify(actualCompanies.companies));
    if (actualCompanies.companies.length === 0) {
      console.warn('[qdc] license has no companies — skipping operations check');
      return;
    }
    const idAzienda = Number(actualCompanies.companies[0].id);
    const operationsTool = createQdcGetOperationsTool(userId);
    const actualOperations = JSON.parse(
      await operationsTool.invoke({ idAzienda, tipo: 'trattamenti' }),
    );
    expect(actualOperations.available).toBe(true);
    expect(typeof actualOperations.count).toBe('number');
    console.log(
      `[qdc] tool trattamenti count=${actualOperations.count} firstKeys=`,
      JSON.stringify(Object.keys(actualOperations.operations[0] ?? {})),
    );
  });
});

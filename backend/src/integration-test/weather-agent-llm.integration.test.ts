import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage } from '@langchain/core/messages';
import { prisma } from './setup';
import { createTestUser, deleteTestUser, createTestCompany } from './helpers';
import { PrismaSettingsRepository } from '../infrastructure/repositories/PrismaSettingsRepository';
import { Settings } from '../domain/entities/Settings';
import { createGetWeatherForecastTool } from '../infrastructure/services/agents/dosage_agent_react/tools/weather/get-weather-forecast.tool';
import { createEvaluateTreatmentWindowTool } from '../infrastructure/services/agents/dosage_agent_react/tools/weather/evaluate-treatment-window.tool';
import { createChatModel } from '../infrastructure/services/llm-model-factory';
import { hasLlmGatewayKey } from '../test/llm-test-keys';

const PADOVA = { latitude: 45.4064, longitude: 11.8768 };

const describeIfLlm = hasLlmGatewayKey() ? describe : describe.skip;

describeIfLlm('Weather tools — LLM-driven smoke (real OpenAI + real Open-Meteo)', () => {
  jest.setTimeout(120_000);

  let userId: string;
  let companyId: string;
  let jobId: string;
  let fieldId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id!;
    const company = await createTestCompany({ userId });
    companyId = company.id!;
    const repo = new PrismaSettingsRepository(prisma);
    await repo.create(
      Settings.create({
        userId,
        language: 'it',
        qdcApiKey: null,
        ifarmingApiKey: null,
        whatsappInstanceName: null,
        whatsappApiKey: null,
        whatsappInstanceId: null,
        whatsappConnected: false,
        whatsappPhoneNumber: null,
        whatsappQrCode: null,
        whatsappLastSync: null,
        whatsappAllowedNumbers: [],
        openMeteoEnabled: true,
      }),
    );
    const field = await prisma.field.create({
      data: {
        companyId,
        name: 'Campo Padova LLM Test',
        latitude: PADOVA.latitude,
        longitude: PADOVA.longitude,
      },
    });
    fieldId = field.id;
    const productionUnit = await prisma.productionUnit.create({
      data: {
        name: 'PU LLM Test',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        areaHa: 5,
        productionUnitsOnFields: { create: { fieldId, areaHaOnField: 5 } },
      },
    });
    const job = await prisma.job.create({
      data: {
        productionUnitId: productionUnit.id,
        dateOfOpeation: new Date(Date.now() + 24 * 60 * 60 * 1000),
        category: 'TREATMENT',
        quantity: 1,
        unitOfMeasureQuantity: 'L',
      },
    });
    jobId = job.id;
  });

  afterAll(async () => {
    await deleteTestUser();
  });

  function buildAgent() {
    const { model: llm } = createChatModel({ modelName: LIVE_TEST_CHAT_MODEL, temperature: 0 });
    const tools = [createGetWeatherForecastTool(userId), createEvaluateTreatmentWindowTool(userId)];
    return createReactAgent({ llm, tools });
  }

  it('selects evaluate_treatment_window when asked to assess a planned treatment', async () => {
    const agent = buildAgent();
    const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const prompt = `Ho un trattamento programmato per il job ${jobId} previsto per ${tomorrowIso}. Verifica se le condizioni meteo sono adatte e segnala eventuali rischi. Se ci sono rischi, suggerisci se rimandare.`;
    const result = await agent.invoke({ messages: [new HumanMessage(prompt)] });
    const toolNames = result.messages
      .flatMap((m) => ('tool_calls' in m && Array.isArray(m.tool_calls) ? m.tool_calls : []))
      .map((tc: { name: string }) => tc.name);
    expect(toolNames).toContain('evaluate_treatment_window');
  });

  it('selects get_weather_forecast when asked for a generic forecast at a coordinate', async () => {
    const agent = buildAgent();
    const prompt = `Quali sono le previsioni meteo a Padova (latitudine ${PADOVA.latitude}, longitudine ${PADOVA.longitude}) per i prossimi 2 giorni?`;
    const result = await agent.invoke({ messages: [new HumanMessage(prompt)] });
    const toolNames = result.messages
      .flatMap((m) => ('tool_calls' in m && Array.isArray(m.tool_calls) ? m.tool_calls : []))
      .map((tc: { name: string }) => tc.name);
    expect(toolNames).toContain('get_weather_forecast');
  });

  it('does not invent forecasts when Open-Meteo is disabled at runtime', async () => {
    const repo = new PrismaSettingsRepository(prisma);
    const settings = await repo.findByUserId(userId);
    if (!settings) throw new Error('settings not found in test fixture');
    await repo.updateOpenMeteoEnabled(settings.id, false);
    try {
      const agent = buildAgent();
      const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const prompt = `Verifica le condizioni meteo per il job ${jobId} previsto per ${tomorrowIso}.`;
      const result = await agent.invoke({ messages: [new HumanMessage(prompt)] });
      const lastMessage = result.messages[result.messages.length - 1];
      const text =
        typeof lastMessage.content === 'string'
          ? lastMessage.content
          : JSON.stringify(lastMessage.content);
      expect(text.toLowerCase()).toMatch(/disabilit|impostazion|integrazion/);
    } finally {
      await repo.updateOpenMeteoEnabled(settings.id, true);
    }
  });
});

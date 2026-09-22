import { randomUUID } from 'crypto';
import { prisma } from './setup';
import { createTestUser, deleteTestUser, createTestCompany } from './helpers';
import { PrismaSettingsRepository } from '../infrastructure/repositories/PrismaSettingsRepository';
import { Settings } from '../domain/entities/Settings';
import { createEvaluateTreatmentWindowTool } from '../infrastructure/services/agents/dosage_agent_react/tools/weather/evaluate-treatment-window.tool';

const PADOVA = { latitude: 45.4064, longitude: 11.8768 };
void (() => PADOVA);

interface SeededJob {
  readonly jobId: string;
  readonly fieldId: string;
}

async function seedJobWithField(
  userId: string,
  companyId: string,
  coords: { latitude: number | null; longitude: number | null },
): Promise<SeededJob> {
  const field = await prisma.field.create({
    data: {
      companyId,
      name: `Test Field ${randomUUID().slice(0, 6)}`,
      latitude: coords.latitude,
      longitude: coords.longitude,
    },
  });
  const productionUnit = await prisma.productionUnit.create({
    data: {
      name: `Test PU ${randomUUID().slice(0, 6)}`,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      areaHa: 5,
      productionUnitsOnFields: { create: { fieldId: field.id, areaHaOnField: 5 } },
    },
  });
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const job = await prisma.job.create({
    data: {
      productionUnitId: productionUnit.id,
      dateOfOpeation: tomorrow,
      category: 'TREATMENT',
      quantity: 1,
      unitOfMeasureQuantity: 'L',
    },
  });
  void (() => userId);
  return { jobId: job.id, fieldId: field.id };
}
void (() => seedJobWithField);

interface SeededMultiFieldJob {
  readonly jobId: string;
  readonly fieldIds: readonly string[];
}

async function seedJobWithMultipleFields(
  companyId: string,
  fieldSpecs: readonly { latitude: number | null; longitude: number | null; name: string }[],
): Promise<SeededMultiFieldJob> {
  const fieldIds: string[] = [];
  const productionUnit = await prisma.productionUnit.create({
    data: {
      name: `Test PU multi ${randomUUID().slice(0, 6)}`,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      areaHa: 10,
    },
  });
  for (const spec of fieldSpecs) {
    const field = await prisma.field.create({
      data: {
        companyId,
        name: spec.name,
        latitude: spec.latitude,
        longitude: spec.longitude,
      },
    });
    fieldIds.push(field.id);
    await prisma.productionUnitOnField.create({
      data: { productionUnitId: productionUnit.id, fieldId: field.id, areaHaOnField: 5 },
    });
  }
  const job = await prisma.job.create({
    data: {
      productionUnitId: productionUnit.id,
      dateOfOpeation: new Date(Date.now() + 24 * 60 * 60 * 1000),
      category: 'TREATMENT',
      quantity: 1,
      unitOfMeasureQuantity: 'L',
    },
  });
  return { jobId: job.id, fieldIds };
}

async function ensureSettings(userId: string, openMeteoEnabled: boolean): Promise<void> {
  const repo = new PrismaSettingsRepository(prisma);
  const existing = await repo.findByUserId(userId);
  if (!existing) {
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
        openMeteoEnabled,
      }),
    );
    return;
  }
  await repo.updateOpenMeteoEnabled(existing.id, openMeteoEnabled);
}
describe('Weather agent tools — DB + real Open-Meteo', () => {
  let userId: string;
  let companyId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id!;
    const company = await createTestCompany({ userId });
    companyId = company.id!;
  });

  afterAll(async () => {
    await deleteTestUser();
  });

  describe('evaluate_treatment_window — Multi-Field handling', () => {
    it('returns one verdict per Field georef when a Job touches multiple Fields', async () => {
      await ensureSettings(userId, true);
      const seeded = await seedJobWithMultipleFields(companyId, [
        { latitude: 45.4064, longitude: 11.8768, name: 'Padova' },
        { latitude: 45.4384, longitude: 10.9916, name: 'Verona' },
      ]);
      const tool = createEvaluateTreatmentWindowTool(userId);
      const raw = await tool.func({
        jobId: seeded.jobId,
        plannedDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        horizonHours: 24,
      });
      const parsed = JSON.parse(raw as string);
      expect(parsed.available).toBe(true);
      expect(parsed.perField).toHaveLength(2);
      const fieldIds = parsed.perField.map((p: { fieldId: string }) => p.fieldId).sort();
      expect(fieldIds).toEqual([...seeded.fieldIds].sort());
      const fieldNames = parsed.perField.map((p: { fieldName: string }) => p.fieldName);
      expect(fieldNames).toEqual(expect.arrayContaining(['Padova', 'Verona']));
      for (const verdict of parsed.perField) {
        expect(verdict.timezone).toMatch(/^Europe\//);
        expect(Array.isArray(verdict.applicationWindows)).toBe(true);
        expect(Array.isArray(verdict.risks)).toBe(true);
      }
      expect(parsed.skippedFields).toBe(0);
    }, 30_000);
    it('reports skippedFields when some Field of the Job lacks coordinates', async () => {
      await ensureSettings(userId, true);
      const seeded = await seedJobWithMultipleFields(companyId, [
        { latitude: 45.4064, longitude: 11.8768, name: 'Padova-georef' },
        { latitude: null, longitude: null, name: 'NoCoords-A' },
        { latitude: null, longitude: null, name: 'NoCoords-B' },
      ]);
      const tool = createEvaluateTreatmentWindowTool(userId);
      const raw = await tool.func({
        jobId: seeded.jobId,
        plannedDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        horizonHours: 12,
      });
      const parsed = JSON.parse(raw as string);
      expect(parsed.available).toBe(true);
      expect(parsed.perField).toHaveLength(1);
      expect(parsed.perField[0].fieldName).toBe('Padova-georef');
      expect(parsed.skippedFields).toBe(2);
      expect(parsed.skippedFieldNames).toEqual(
        expect.arrayContaining(['NoCoords-A', 'NoCoords-B']),
      );
    }, 20_000);
  });});

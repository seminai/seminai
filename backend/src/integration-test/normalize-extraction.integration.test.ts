import {
  createTestUser,
  createTestCompany,
  prisma,
  type ITestUser,
  type ITestCompany,
} from './helpers';
import { createNormalizeExtractionTool } from '../infrastructure/services/agents/dosage_agent_react/tools/normalize-extraction.tool';
import {
  clearWorkingMemory,
  getWorkingMemory,
  updateWorkingMemory,
} from '../infrastructure/services/agents/dosage_agent_react/working-memory';
import type { NormalizedExtraction } from '../application/services/extraction-normalization/normalized-extraction.types';

describe('normalize_extraction integration', () => {
  let testUser: ITestUser;
  let testCompany: ITestCompany;
  let existingFieldId: string;

  beforeAll(async () => {
    testUser = await createTestUser();
    testCompany = await createTestCompany({ userId: testUser.id });
    const existing = await prisma.field.create({
      data: {
        name: 'Campo Esistente',
        companyId: testCompany.id,
        coordinates: [],
        foglio: '12',
        particella: '34',
        sezione: null,
        city: 'Verona',
        sauHa: 2,
        uso: 'Vite',
      },
    });
    existingFieldId = existing.id;
    const existingPU = await prisma.productionUnit.create({
      data: {
        name: 'UP esistente',
        areaHa: 2,
        startDate: new Date('2026-03-01'),
        endDate: new Date('2026-11-30'),
      },
    });
    await prisma.productionCycle.create({
      data: {
        productionUnitId: existingPU.id,
        cropName: 'Vite',
        cropType: 'Da vino',
        variety: 'Sangiovese',
        protocoll: 'Convenzionale',
        seasonYear: 2026,
        cycleIndex: 0,
        floweringDate: new Date('2026-05-01'),
        harvestingDate: new Date('2026-10-15'),
        protectionStructure: 'Nessuna',
        acquaTotalePeridoL: 0,
      },
    });
    await prisma.productionUnitOnField.create({
      data: {
        productionUnitId: existingPU.id,
        fieldId: existingFieldId,
        areaHaOnField: 2,
      },
    });
  });

  it('marks fields as new, existing, and occupied; groups production units by (cropName, comune, foglio, usi); is deterministic', async () => {
    const threadId = `norm-${Date.now()}`;
    updateWorkingMemory(threadId, {
      extractedFileData: {
        companies: [],
        fields: [
          {
            // Field that matches the existing one: should become 'occupied'
            name: 'Vigna A',
            foglio: '12',
            particella: '34',
            comune: 'Verona',
            usiSuolo: ['Vite'],
            sauHa: 2,
          },
          {
            // New field on a different foglio: status='new', same comune/crop → separate UP
            name: 'Vigna B',
            foglio: '13',
            particella: '5',
            comune: 'Verona',
            usiSuolo: ['Vite'],
            sauHa: 1,
          },
          {
            // New field, different crop
            name: 'Oliveto',
            foglio: '20',
            particella: '7',
            comune: 'Lazise',
            usiSuolo: ['Olivo'],
            sauHa: 3,
          },
        ],
        productionUnits: [
          {
            name: 'UP Vite occupata',
            cropType: 'Da vino',
            protocoll: 'Convenzionale',
            areaHa: 2,
            cycles: [
              {
                cropName: 'Vite',
                variety: 'Sangiovese',
                startDate: '2026-04-01',
                endDate: '2026-10-15',
              },
            ],
            allocations: [{ foglio: '12', particella: '34' }],
          },
          {
            name: 'UP Vite nuova',
            cropType: 'Da vino',
            protocoll: 'Convenzionale',
            areaHa: 1,
            cycles: [
              {
                cropName: 'Vite',
                variety: 'Sangiovese',
                startDate: '2026-04-01',
                endDate: '2026-10-15',
              },
            ],
            allocations: [{ foglio: '13', particella: '5' }],
          },
          {
            name: 'UP Olivo',
            cropType: 'Olio',
            protocoll: 'Biologico',
            areaHa: 3,
            cycles: [
              {
                cropName: 'Olivo',
                variety: 'Frantoio',
                startDate: '2026-05-01',
                endDate: '2026-11-30',
              },
            ],
            allocations: [{ foglio: '20', particella: '7' }],
          },
        ],
      },
    });

    const tool = createNormalizeExtractionTool(threadId);
    const firstResult = await tool.invoke({ companyId: testCompany.id });
    const secondResult = await tool.invoke({ companyId: testCompany.id });
    const parsed = JSON.parse(firstResult as string);

    expect(parsed.error).toBeUndefined();
    expect(parsed.fieldsNew).toBe(2);
    expect(parsed.fieldsExisting + parsed.fieldsOccupied).toBe(1);
    expect(parsed.fieldsOccupied).toBe(1);
    expect(parsed.productionUnitsGrouped).toBe(3);

    const normalized = getWorkingMemory(threadId).normalizedExtraction as NormalizedExtraction;
    expect(normalized).toBeDefined();
    const occupied = normalized.fields.find((field) => field.status === 'occupied');
    expect(occupied?.existingFieldId).toBe(existingFieldId);
    expect(occupied?.occupiedBy?.[0].cropName).toBe('Vite');

    const groupingFogli = normalized.productionUnits.map((unit) => unit.groupingKey.foglio).sort();
    expect(groupingFogli).toEqual(['12', '13', '20']);

    expect(JSON.parse(firstResult as string)).toEqual(JSON.parse(secondResult as string));
    clearWorkingMemory(threadId);
  });

  it('returns an error when extractedFileData is missing in working memory', async () => {
    const threadId = `norm-missing-${Date.now()}`;
    const tool = createNormalizeExtractionTool(threadId);
    const result = await tool.invoke({ companyId: testCompany.id });
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('extractedFileData');
    clearWorkingMemory(threadId);
  });
});

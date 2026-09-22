jest.setTimeout(120000);

import { prisma, createTestUser, createTestCompany, deleteAllTestCompanies } from './helpers';
import { runFlows, InputDosageAgent } from '../infrastructure/services/agents/dosage_agent';
import { cleanupTestData } from './setup';
import { PrismaProductionUnitRepository } from '../infrastructure/repositories/PrismaProductionUnitRepository';
import { PrismaFieldRepository } from '../infrastructure/repositories/PrismaFieldRepository';
import { CreateProductionUnitUseCase } from '../application/use-cases/production-unit/CreateProductionUnitUseCase';
import { Field } from '../domain/entities/Field';

describe('POST /dosage-agent/run', () => {
  let testUserId: string;
  let testCompanyId: string;
  let testFieldId: string;
  let puPereId: string;
  let puKiwiId: string;
  let puFrumentoId: string;

  beforeAll(async () => {
    const tu = await createTestUser();
    testUserId = tu.id!;
  });

  beforeEach(async () => {
    await deleteAllTestCompanies(testUserId);
    const company = await createTestCompany({ userId: testUserId });
    testCompanyId = company.id!;

    // Create a field to host production units
    const fieldRepo = new PrismaFieldRepository(prisma);
    const field = Field.create({
      companyId: testCompanyId,
      name: `F-${Date.now()}`,
      coordinates: [],
      latitude: null,
      longitude: null,
      polygon: null,
      gisHa: null,
      sauHa: 10,
      ph: null,
      nitrogen: null,
      phosphorus: null,
      potassium: null,
      calcium: null,
      magnesium: null,
      soilType: null,
      uso: null,
      qualita: null,
      superficieCatastaleMq: 100,
      sezione: 'S',
      foglio: '10',
      particella: '100',
      subalterno: null,
      nation: null,
      region: null,
      city: null,
      address: 'Addr',
      cap: null,
      variazioneMq: null,
      inizioConduzione: null,
      fineConduzione: null,
      bufferZoneNotes: null,
    });
    const createdField = await fieldRepo.create(field);
    testFieldId = createdField.id;

    // Create production units: Pere, Kiwi, Frumento
    const puRepo = new PrismaProductionUnitRepository(prisma);
    const createPU = new CreateProductionUnitUseCase(puRepo, fieldRepo);
    const now = new Date('2025-01-10');
    const mkDates = (offset: number) => ({
      start: new Date(now.getTime() + offset * 86400000),
      flower: new Date(now.getTime() + (offset + 10) * 86400000),
      harvest: new Date(now.getTime() + (offset + 60) * 86400000),
      end: new Date(now.getTime() + (offset + 90) * 86400000),
    });

    const d1 = mkDates(0);
    const d2 = mkDates(1);
    const d3 = mkDates(2);

    const pere = await createPU.execute({
      allocations: [{ fieldId: testFieldId, areaHa: 2 }],
      name: 'PU-Pere',
      cropName: 'Pere',
      cropType: 'Pere',
      variety: 'Abate',
      protocoll: 'P',
      areaHa: 2,
      protectionStructure: 'N',
      startDate: d1.start,
      floweringDate: d1.flower,
      harvestingDate: d1.harvest,
      endDate: d1.end,
      acquaTotalePeridoL: 10,
    });
    puPereId = pere.productionUnit.id;

    const kiwi = await createPU.execute({
      allocations: [{ fieldId: testFieldId, areaHa: 3 }],
      name: 'PU-Kiwi',
      cropName: 'Kiwi',
      cropType: 'Kiwi',
      variety: 'Hayward',
      protocoll: 'P',
      areaHa: 3,
      protectionStructure: 'N',
      startDate: d2.start,
      floweringDate: d2.flower,
      harvestingDate: d2.harvest,
      endDate: d2.end,
      acquaTotalePeridoL: 15,
    });
    puKiwiId = kiwi.productionUnit.id;

    const frumento = await createPU.execute({
      allocations: [{ fieldId: testFieldId, areaHa: 5 }],
      name: 'PU-Frumento',
      cropName: 'Frumento',
      cropType: 'Frumento',
      variety: 'Duro',
      protocoll: 'P',
      areaHa: 5,
      protectionStructure: 'N',
      startDate: d3.start,
      floweringDate: d3.flower,
      harvestingDate: d3.harvest,
      endDate: d3.end,
      acquaTotalePeridoL: 20,
    });
    puFrumentoId = frumento.productionUnit.id;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it('should return allowed products per production unit and log results (fetching SIAN online)', async () => {
    const body = {
      products: [
        {
          productName: 'prolectus 50 wg',
          registrationNumber: '15549',
          quantity: 10,
          quantityUnitOfMeasure: 'kg',
        },
        {
          productName: 'revysion',
          registrationNumber: '17866',
          quantity: 5,
          quantityUnitOfMeasure: 'L',
        },
        {
          productName: 'vernoil',
          registrationNumber: '10142',
          quantity: 8,
          quantityUnitOfMeasure: 'L',
        },
      ],
      unitOfProduction: [
        { id: puPereId, cropType: 'Pere' },
        { id: puKiwiId, cropType: 'Kiwi' },
        { id: puFrumentoId, cropType: 'Frumento' },
      ],
    };

    // minimal mock of Express Request/Response
    const input: InputDosageAgent = body as unknown as InputDosageAgent;
    const result = await runFlows(input);

    expect(result).toHaveProperty('outcome');
    expect(result).toHaveProperty('outcomeWithDosage');
    expect(Array.isArray(result.outcome)).toBe(true);
    expect(Array.isArray(result.outcomeWithDosage)).toBe(true);

    // eslint-disable-next-line no-console
    console.log('\n[dosage-agent] outcome:', JSON.stringify(result.outcome, null, 2));
    // eslint-disable-next-line no-console
    console.log(
      '\n[dosage-agent] outcomeWithDosage:',
      JSON.stringify(result.outcomeWithDosage, null, 2),
    );

    for (const item of result.outcomeWithDosage) {
      expect(item).toHaveProperty('unitProductionId');
      expect(item).toHaveProperty('products');
      expect(Array.isArray(item.products)).toBe(true);
      // Check that dosage fields are present in products
      for (const product of item.products) {
        expect(product).toHaveProperty('name');
        expect(product).toHaveProperty('regNumber');
        // Dosage fields should be present (even if undefined)
        expect(product).toHaveProperty('data_distribuzione_start');
        expect(product).toHaveProperty('dosaggio_minimo');
        expect(product).toHaveProperty('note');
      }
    }
  });

  it('should keep planned applications within the requested startAt/endAt window when provided', async () => {
    const body = {
      products: [
        {
          productName: 'prolectus 50 wg',
          registrationNumber: '15549',
          quantity: 10,
          quantityUnitOfMeasure: 'kg',
        },
      ],
      unitOfProduction: [{ id: puPereId, cropType: 'Pere' }],
      startAt: '2025-02-01',
      endAt: '2025-02-28',
    };
    const input: InputDosageAgent = body as unknown as InputDosageAgent;
    const result = await runFlows(input);
    const startAt = new Date('2025-02-01T00:00:00.000Z').getTime();
    const endAt = new Date('2025-02-28T23:59:59.999Z').getTime();
    for (const unit of result.outcomeWithDosage) {
      for (const product of unit.products) {
        const treatments = (product as { trattamenti?: Array<{ data_distribuzione?: Date }> })
          .trattamenti;
        for (const t of treatments || []) {
          if (t.data_distribuzione) {
            const actualTime = t.data_distribuzione.getTime();
            expect(actualTime).toBeGreaterThanOrEqual(startAt);
            expect(actualTime).toBeLessThanOrEqual(endAt);
          }
        }
      }
    }
  });
});

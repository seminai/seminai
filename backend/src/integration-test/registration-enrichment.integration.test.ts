import { describe, beforeAll, beforeEach, afterAll, it, expect } from '@jest/globals';
import { prisma, cleanupTestData } from './setup';
import { createTestUser, createTestCompany, deleteAllTestCompanies } from './helpers';
import { PrismaProductionUnitRepository } from '../infrastructure/repositories/PrismaProductionUnitRepository';
import { PrismaProductRepository } from '../infrastructure/repositories/PrismaProductRepository';
import { PrismaLabelExtractionRepository } from '../infrastructure/repositories/PrismaLabelExtractionRepository';
import { PrismaFieldRepository } from '../infrastructure/repositories/PrismaFieldRepository';
import { GetLabelTextProvider } from '../infrastructure/services/tool/getLabelText.provider';
import { ExtractLabelAdapter } from '../infrastructure/services/tool/extractLabel.adapter';
import { ProductionUnitMatcherService } from '../application/services/ProductionUnitMatcherService';
import { Field } from '../domain/entities/Field';
import { ProductionUnit } from '../domain/entities/ProductionUnit';
import { JobCategory, ProductCategory } from '@prisma/client';
import { BulkCreateJobItemDTO } from '../application/use-cases/job/BulkCreateProductAndJobUseCase';

describe('Registration Enrichment from Brogliaccio', () => {
  let testUserId: string;
  let matcher: ProductionUnitMatcherService;
  let fieldRepo: PrismaFieldRepository;
  let puRepo: PrismaProductionUnitRepository;

  beforeAll(async () => {
    fieldRepo = new PrismaFieldRepository(prisma);
    puRepo = new PrismaProductionUnitRepository(prisma);

    const user = await createTestUser();
    testUserId = user.id!;

    matcher = new ProductionUnitMatcherService(
      puRepo,
      new PrismaProductRepository(prisma),
      new PrismaLabelExtractionRepository(prisma),
      new GetLabelTextProvider(),
      new ExtractLabelAdapter(),
    );
  });

  beforeEach(async () => {
    await deleteAllTestCompanies(testUserId);

    const company = await createTestCompany({ userId: testUserId, name: 'Azienda Viticola Test' });

    const field = Field.create({
      companyId: company.id!,
      name: `Field-Vite-${Date.now()}`,
      coordinates: [],
      latitude: null,
      longitude: null,
      polygon: null,
      gisHa: null,
      sauHa: 5,
      ph: null,
      nitrogen: null,
      phosphorus: null,
      potassium: null,
      calcium: null,
      magnesium: null,
      soilType: null,
      uso: null,
      qualita: null,
      superficieCatastaleMq: 50000,
      sezione: 'A',
      foglio: '1',
      particella: '10',
      subalterno: null,
      nation: 'Italia',
      region: 'Veneto',
      city: 'Verona',
      address: 'Via Vigneto 1',
      cap: '37100',
      variazioneMq: null,
      inizioConduzione: null,
      fineConduzione: null,
      bufferZoneNotes: null,
    });
    const createdField = await fieldRepo.create(field);

    // Production unit with "Vite" crop - products like SULFAR and GALILEO are used on vines
    const pu = ProductionUnit.create({
      name: 'Vigneto Test',
      cropName: 'Vite',
      cropType: 'Fruttifero',
      variety: 'Garganega',
      protocoll: 'Convenzionale',
      areaHa: 5,
      protectionStructure: 'N',
      startDate: new Date('2026-01-01'),
      floweringDate: new Date('2026-05-01'),
      harvestingDate: new Date('2026-09-01'),
      endDate: new Date('2026-11-01'),
      occupazione: null,
      destinazioneDiUso: null,
      acquaTotalePeridoL: 0,
    });
    await puRepo.create(pu, [{ fieldId: createdField.id, areaHaOnField: 5 }]);
  });

  afterAll(async () => {
    await deleteAllTestCompanies(testUserId);
    await cleanupTestData();
  });

  it('should enrich registration numbers from ministry dataset and resolve items', async () => {
    // Same payload as brogliaccio extraction: products without registrationNumber
    const items: BulkCreateJobItemDTO[] = [
      {
        // NO productionUnitId - must be resolved automatically
        dateOfOpeation: new Date('2026-06-16'),
        category: JobCategory.TREATMENT,
        quantity: 15,
        unitOfMeasureQuantity: 'KG',
        stocks: [
          {
            product: {
              name: 'SULFAR', // Exists in dataset → regNumber 011196
              category: ProductCategory.PESTICIDE,
              type: 'FITOSANITARIO',
              registrationNumber: '', // Empty, as from brogliaccio
              sku: '',
              barcode: null,
              description: null,
              labelUrl: null,
              labelMetadata: null,
            },
            quantity: -15,
            unitOfMeasureQuantity: 'KG',
            price: 0,
            unitOfMeasurePrice: 'EUR',
            type: 'OUT',
          },
        ],
      },
      {
        dateOfOpeation: new Date('2026-06-16'),
        category: JobCategory.TREATMENT,
        quantity: 5,
        unitOfMeasureQuantity: 'L',
        stocks: [
          {
            product: {
              name: 'GALILEO', // Exists in dataset → regNumber 017680
              category: ProductCategory.PESTICIDE,
              type: 'FITOSANITARIO',
              registrationNumber: '',
              sku: '',
              barcode: null,
              description: null,
              labelUrl: null,
              labelMetadata: null,
            },
            quantity: -5,
            unitOfMeasureQuantity: 'L',
            price: 0,
            unitOfMeasurePrice: 'EUR',
            type: 'OUT',
          },
        ],
      },
      {
        dateOfOpeation: new Date('2026-06-16'),
        category: JobCategory.TREATMENT,
        quantity: 20,
        unitOfMeasureQuantity: 'L',
        stocks: [
          {
            product: {
              name: 'CALCISAN GREEN', // NOT in dataset → should get warning
              category: ProductCategory.PESTICIDE,
              type: 'FITOSANITARIO',
              registrationNumber: '',
              sku: '',
              barcode: null,
              description: null,
              labelUrl: null,
              labelMetadata: null,
            },
            quantity: -20,
            unitOfMeasureQuantity: 'L',
            price: 0,
            unitOfMeasurePrice: 'EUR',
            type: 'OUT',
          },
        ],
      },
    ];

    const result = await matcher.resolveItems(items, testUserId);

    console.log('=== Registration Enrichment Results ===');
    console.log('Resolved items:', result.resolvedItems.length);
    console.log(
      'Resolved items details:',
      JSON.stringify(
        result.resolvedItems.map((item) => ({
          productionUnitId: item.productionUnitId,
          stocks: item.stocks?.map((s) => ({
            productName: s.product?.name,
            registrationNumber: s.product?.registrationNumber,
          })),
        })),
        null,
        2,
      ),
    );
    console.log('Warnings:', JSON.stringify(result.warnings, null, 2));

    // CALCISAN GREEN must have warning because it's NOT in the ministry dataset
    const calcisanWarning = result.warnings.find((w) => w.productName === 'CALCISAN GREEN');
    expect(calcisanWarning).toBeDefined();
    expect(calcisanWarning!.reason).toContain(
      'Impossibile risolvere label senza numero di registrazione',
    );

    // SULFAR and GALILEO should NOT have the "senza numero di registrazione" warning
    // because they should be enriched from the ministry dataset.
    // They may still have other warnings (e.g. label extraction failed, no compatible PU)
    // but the registration number itself should be resolved.
    const sulfarWarning = result.warnings.find(
      (w) =>
        w.productName === 'SULFAR' &&
        w.reason.includes('Impossibile risolvere label senza numero di registrazione'),
    );
    const galileoWarning = result.warnings.find(
      (w) =>
        w.productName === 'GALILEO' &&
        w.reason.includes('Impossibile risolvere label senza numero di registrazione'),
    );

    expect(sulfarWarning).toBeUndefined();
    expect(galileoWarning).toBeUndefined();

    // Check that enriched products have registration numbers in the stock items
    // They should be in either resolvedItems (matched) or warnings with a different reason
    const allStocks = result.resolvedItems.flatMap((item) => item.stocks || []);
    const sulfarStock = allStocks.find((s) => s.product?.name === 'SULFAR');
    const galileoStock = allStocks.find((s) => s.product?.name === 'GALILEO');

    if (sulfarStock) {
      expect(sulfarStock.product?.registrationNumber).toBe('011196');
      console.log('SULFAR matched to production unit and enriched with regNumber 011196');
    }
    if (galileoStock) {
      expect(galileoStock.product?.registrationNumber).toBe('017680');
      console.log('GALILEO matched to production unit and enriched with regNumber 017680');
    }
  }, 120_000);
});

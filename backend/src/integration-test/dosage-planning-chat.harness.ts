import { createTestUser, createTestCompany, prisma } from './helpers';
import type { ITestUser, ITestCompany } from './helpers';

export interface DosagePlanningFixture {
  readonly testUser: ITestUser;
  readonly testCompany: ITestCompany;
}

export async function setupDosagePlanningFixture(): Promise<DosagePlanningFixture> {
  const productIds: string[] = [];
  const testUser = await createTestUser();
  const testCompany = await createTestCompany({
    userId: testUser.id,
    name: 'Azienda Agricola Test SRL',
  });
  const warehouse = await prisma.warehouse.create({
    data: {
      companyId: testCompany.id,
      name: 'Magazzino Principale',
      address: 'Via dei Campi 1',
      sezione: 'A',
      foglio: '10',
      particella: '123',
    },
  });
  const warehouseId = warehouse.id;
  const field1 = await prisma.field.create({
    data: {
      companyId: testCompany.id,
      name: 'Campo Vite Nord',
      coordinates: [11.88, 44.29],
      coordinatesGaussBoaga: [],
      gisHa: 8.5,
      sauHa: 8.0,
      city: 'Faenza',
      region: 'Emilia-Romagna',
    },
  });
  const fieldId1 = field1.id;
  const field2 = await prisma.field.create({
    data: {
      companyId: testCompany.id,
      name: 'Campo Melo Est',
      coordinates: [12.24, 44.14],
      coordinatesGaussBoaga: [],
      gisHa: 3.5,
      sauHa: 3.2,
      city: 'Cesena',
      region: 'Emilia-Romagna',
    },
  });
  const fieldId2 = field2.id;
  await prisma.productionUnit.create({
    data: {
      name: 'Vite - Trebbiano',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-10-15'),
      areaHa: 5.0,
      productionUnitsOnFields: {
        create: { fieldId: fieldId1, areaHaOnField: 5.0 },
      },
      cycles: {
        create: {
          cropName: 'Vite',
          cropType: 'Fruttifero',
          variety: 'Trebbiano',
          protocoll: 'Integrato',
          protectionStructure: 'Nessuna',
          acquaTotalePeridoL: 2500,
          seasonYear: 2026,
          cycleIndex: 1,
        },
      },
    },
  });
  await prisma.productionUnit.create({
    data: {
      name: 'Melo - Golden Delicious',
      startDate: new Date('2026-02-15'),
      endDate: new Date('2026-11-30'),
      areaHa: 3.5,
      productionUnitsOnFields: {
        create: { fieldId: fieldId2, areaHaOnField: 3.5 },
      },
      cycles: {
        create: {
          cropName: 'Melo',
          cropType: 'Fruttifero',
          variety: 'Golden Delicious',
          protocoll: 'Integrato',
          protectionStructure: 'Antigrandine',
          acquaTotalePeridoL: 3000,
          seasonYear: 2026,
          cycleIndex: 1,
        },
      },
    },
  });
  const productsData = [
    {
      name: 'Captano 80 WG',
      sku: 'CAP80WG',
      registrationNumber: '3872',
      category: 'PESTICIDE' as const,
      type: 'Fungicida',
      stockQty: 15,
      stockUnit: 'kg',
    },
    {
      name: 'Prolectus 50 WG',
      sku: 'PROL50WG',
      registrationNumber: '15549',
      category: 'PESTICIDE' as const,
      type: 'Fungicida',
      stockQty: 8,
      stockUnit: 'kg',
    },
    {
      name: 'Revysion',
      sku: 'REVYSION',
      registrationNumber: '17866',
      category: 'PESTICIDE' as const,
      type: 'Fungicida',
      stockQty: 5,
      stockUnit: 'L',
    },
  ];
  for (const pd of productsData) {
    const product = await prisma.product.create({
      data: {
        name: pd.name,
        sku: pd.sku,
        registrationNumber: pd.registrationNumber,
        category: pd.category,
        type: pd.type,
        warehouseId,
        stocks: {
          create: {
            quantity: pd.stockQty,
            unitOfMeasureQuantity: pd.stockUnit,
            price: 0,
            unitOfMeasurePrice: 'EUR',
            type: 'IN',
          },
        },
      },
    });
    productIds.push(product.id);
  }
  return { testUser, testCompany };
}

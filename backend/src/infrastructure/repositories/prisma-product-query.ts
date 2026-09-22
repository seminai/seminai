import { Prisma } from '@prisma/client';

export const VERIFIED_STOCK_WHERE: Prisma.StockWhereInput = {
  OR: [{ jobId: null }, { job: { isVerified: true } }],
};

export const STOCK_RELATIONS_INCLUDE = {
  sourceFile: true,
  job: {
    select: {
      id: true,
      isVerified: true,
      dateOfOpeation: true,
      category: true,
      quantity: true,
      unitOfMeasureQuantity: true,
      productQuantityTreated: true,
      unitOfMeasureProductQuantityTreated: true,
      modeOfApplication: true,
      avversity: true,
      giustification: true,
      treatedSurface: true,
      isLocalizedTreatment: true,
      note: true,
      totalDistributedWaterL: true,
      createdAt: true,
      updatedAt: true,
      productionUnit: {
        select: {
          id: true,
          name: true,
          areaHa: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          updatedAt: true,
          cycles: {
            orderBy: [{ seasonYear: 'desc' }, { cycleIndex: 'desc' }, { harvestingDate: 'desc' }],
            take: 1,
            select: {
              id: true,
              cropName: true,
              cropType: true,
              variety: true,
              protocoll: true,
              protectionStructure: true,
              floweringDate: true,
              harvestingDate: true,
              occupazione: true,
              destinazioneDiUso: true,
              acquaTotalePeridoL: true,
              seasonYear: true,
              cycleIndex: true,
            },
          },
          productionUnitsOnFields: {
            select: {
              id: true,
              areaHaOnField: true,
              field: {
                select: {
                  id: true,
                  companyId: true,
                  name: true,
                  coordinates: true,
                  latitude: true,
                  longitude: true,
                  polygon: true,
                  gisHa: true,
                  sauHa: true,
                  ph: true,
                  nitrogen: true,
                  phosphorus: true,
                  potassium: true,
                  calcium: true,
                  magnesium: true,
                  soilType: true,
                  uso: true,
                  qualita: true,
                  superficieCatastaleMq: true,
                  sezione: true,
                  foglio: true,
                  particella: true,
                  subalterno: true,
                  nation: true,
                  region: true,
                  city: true,
                  address: true,
                  cap: true,
                  variazioneMq: true,
                  inizioConduzione: true,
                  fineConduzione: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.StockInclude;

export const WAREHOUSE_RELATIONS_SELECT = {
  name: true,
  company: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.WarehouseSelect;

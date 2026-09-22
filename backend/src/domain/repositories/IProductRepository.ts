import { Product } from '../entities/Product';
import { Prisma } from '@prisma/client';

export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    stocks: {
      include: {
        sourceFile: true;
        job: {
          select: {
            id: true;
            isVerified: true;
            dateOfOpeation: true;
            category: true;
            quantity: true;
            unitOfMeasureQuantity: true;
            productQuantityTreated: true;
            unitOfMeasureProductQuantityTreated: true;
            modeOfApplication: true;
            avversity: true;
            giustification: true;
            treatedSurface: true;
            isLocalizedTreatment: true;
            note: true;
            totalDistributedWaterL: true;
            createdAt: true;
            updatedAt: true;
            productionUnit: {
              select: {
                id: true;
                name: true;
                areaHa: true;
                startDate: true;
                endDate: true;
                createdAt: true;
                updatedAt: true;
                cycles: {
                  select: {
                    id: true;
                    cropName: true;
                    cropType: true;
                    variety: true;
                    protocoll: true;
                    protectionStructure: true;
                    floweringDate: true;
                    harvestingDate: true;
                    occupazione: true;
                    destinazioneDiUso: true;
                    acquaTotalePeridoL: true;
                    seasonYear: true;
                    cycleIndex: true;
                  };
                };
                productionUnitsOnFields: {
                  select: {
                    id: true;
                    areaHaOnField: true;
                    field: {
                      select: {
                        id: true;
                        companyId: true;
                        name: true;
                        coordinates: true;
                        latitude: true;
                        longitude: true;
                        polygon: true;
                        gisHa: true;
                        sauHa: true;
                        ph: true;
                        nitrogen: true;
                        phosphorus: true;
                        potassium: true;
                        calcium: true;
                        magnesium: true;
                        soilType: true;
                        uso: true;
                        qualita: true;
                        superficieCatastaleMq: true;
                        sezione: true;
                        foglio: true;
                        particella: true;
                        subalterno: true;
                        nation: true;
                        region: true;
                        city: true;
                        address: true;
                        cap: true;
                        variazioneMq: true;
                        inizioConduzione: true;
                        fineConduzione: true;
                        createdAt: true;
                        updatedAt: true;
                      };
                    };
                  };
                };
              };
            };
          };
        };
      };
    };
    warehouse: {
      select: {
        name: true;
        company: {
          select: {
            id: true;
            name: true;
          };
        };
      };
    };
  };
}>;

export interface IProductRepository {
  create(product: Product): Promise<Product>;
  createMany(products: Product[]): Promise<void>;
  findById(id: string): Promise<ProductWithRelations | null>;
  findManyByWarehouseId(warehouseId: string): Promise<ProductWithRelations[]>;
  findManyByUserId(userId: string, companyName?: string): Promise<ProductWithRelations[]>;
  /** Lightweight list of every product belonging to a company (across its warehouses). */
  findManyByCompanyId(companyId: string): Promise<Product[]>;
  findByNameAndWarehouseId(name: string, warehouseId: string): Promise<Product | null>;
  findAllWithRegistrationNumber(): Promise<Product[]>;
  findAllWithRegistrationNumberByUserId(userId: string): Promise<Product[]>;
  findAllByUserId(userId: string): Promise<Product[]>;
  update(id: string, data: Partial<Product>): Promise<Product>;
  updateAdministrativeStatusBulk(
    updates: Array<{ id: string; administrativeStatus: string | null }>,
  ): Promise<number>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[], companyId?: string): Promise<void>;
}

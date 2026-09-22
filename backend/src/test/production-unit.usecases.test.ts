// import { PrismaClient } from '@prisma/client';
import { IProductionUnitRepository } from '../domain/repositories/IProductionUnitRepository';
import { IFieldRepository } from '../domain/repositories/IFieldRepository';
import { Field } from '../domain/entities/Field';
import { ProductionUnit } from '../domain/entities/ProductionUnit';
import { CreateProductionUnitUseCase } from '../application/use-cases/production-unit/CreateProductionUnitUseCase';
import { UpdateProductionUnitUseCase } from '../application/use-cases/production-unit/UpdateProductionUnitUseCase';
import { AppError } from '../domain/errors/AppError';

describe('ProductionUnit UseCases', () => {
  // const prisma = new PrismaClient();
  let repo: jest.Mocked<IProductionUnitRepository>;
  let fieldRepo: jest.Mocked<IFieldRepository>;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      createMany: jest.fn(),
      findById: jest.fn(),
      findManyByFieldId: jest.fn(),
      sumAreaByFieldAndOverlappingRange: jest.fn(),
      getOverlappingDateWindow: jest
        .fn()
        .mockResolvedValue({ earliestStart: null, latestEnd: null }),
      getAllocationsByProductionUnit: jest.fn().mockResolvedValue([]),
      listFieldIdsByProductionUnit: jest.fn().mockResolvedValue([]),
      replaceAllocations: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IProductionUnitRepository>;
    fieldRepo = {
      create: jest.fn(),
      createMany: jest.fn(),
      findById: jest.fn(),
      findManyByCompanyId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IFieldRepository>;
  });

  describe('CreateProductionUnitUseCase', () => {
    it('rejects when overlapping area exceeds field sauHa', async () => {
      fieldRepo.findById.mockResolvedValue({
        id: 'field1',
        companyId: 'c1',
        name: 'F',
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
        superficieCatastaleMq: 100,
        sezione: 'S',
        foglio: 'F',
        particella: 'P',
        subalterno: null,
        nation: null,
        region: null,
        city: null,
        address: 'Addr',
        cap: null,
        variazioneMq: null,
        inizioConduzione: null,
        fineConduzione: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        productionUnits: [],
      } as unknown as Field);
      repo.sumAreaByFieldAndOverlappingRange.mockResolvedValue(4);

      const useCase = new CreateProductionUnitUseCase(repo, fieldRepo);
      await expect(
        useCase.execute({
          allocations: [{ fieldId: 'field1', areaHa: 2 }],
          name: 'PU',
          cropName: 'Crop',
          cropType: 'CT',
          variety: 'V',
          protocoll: 'P',
          areaHa: 2,
          protectionStructure: 'N',
          startDate: new Date('2025-01-01'),
          floweringDate: new Date('2025-02-01'),
          harvestingDate: new Date('2025-03-01'),
          endDate: new Date('2025-04-01'),
          acquaTotalePeridoL: 10,
        }),
      ).rejects.toThrow(AppError);
    });

    it('creates when area within availability', async () => {
      fieldRepo.findById.mockResolvedValue({
        id: 'field1',
        companyId: 'c1',
        name: 'F',
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
        foglio: 'F',
        particella: 'P',
        subalterno: null,
        nation: null,
        region: null,
        city: null,
        address: 'Addr',
        cap: null,
        variazioneMq: null,
        inizioConduzione: null,
        fineConduzione: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        productionUnits: [],
      } as unknown as Field);
      repo.sumAreaByFieldAndOverlappingRange.mockResolvedValue(3);

      const useCase = new CreateProductionUnitUseCase(repo, fieldRepo);
      repo.create.mockImplementation(async (productionUnit) => productionUnit);
      const { productionUnit } = await useCase.execute({
        allocations: [{ fieldId: 'field1', areaHa: 4 }],
        name: 'PU',
        cropName: 'Crop',
        cropType: 'CT',
        variety: 'V',
        protocoll: 'P',
        areaHa: 4,
        protectionStructure: 'N',
        startDate: new Date('2025-01-01'),
        floweringDate: new Date('2025-02-01'),
        harvestingDate: new Date('2025-03-01'),
        endDate: new Date('2025-04-01'),
        acquaTotalePeridoL: 10,
      });
      expect(productionUnit.areaHa).toBe(4);
    });
  });

  describe('UpdateProductionUnitUseCase', () => {
    it('rejects when updated overlap exceeds sauHa', async () => {
      fieldRepo.findById.mockResolvedValue({
        id: 'field1',
        companyId: 'c1',
        name: 'F',
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
        superficieCatastaleMq: 100,
        sezione: 'S',
        foglio: 'F',
        particella: 'P',
        subalterno: null,
        nation: null,
        region: null,
        city: null,
        address: 'Addr',
        cap: null,
        variazioneMq: null,
        inizioConduzione: null,
        fineConduzione: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        productionUnits: [],
      } as unknown as Field);
      repo.findById.mockResolvedValue(
        ProductionUnit.create({
          name: 'PU',
          cropName: 'Crop',
          cropType: 'CT',
          variety: 'V',
          protocoll: 'P',
          areaHa: 2,
          protectionStructure: 'N',
          startDate: new Date('2025-01-01'),
          floweringDate: new Date('2025-02-01'),
          harvestingDate: new Date('2025-03-01'),
          endDate: new Date('2025-04-01'),
          acquaTotalePeridoL: 10,
        }),
      );
      // Previous allocations indicate the PU was allocated with 2 ha on field1
      repo.getAllocationsByProductionUnit.mockResolvedValue([
        { fieldId: 'field1', areaHaOnField: 2 },
      ]);
      repo.sumAreaByFieldAndOverlappingRange.mockResolvedValue(5); // includes existing 2

      const useCase = new UpdateProductionUnitUseCase(repo, fieldRepo);
      await expect(useCase.execute({ id: 'pu1', data: { areaHa: 4 } })).rejects.toThrow(AppError);
    });
  });
});

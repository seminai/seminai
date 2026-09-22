import { IProductionUnitRepository } from '../domain/repositories/IProductionUnitRepository';
import { IFieldRepository } from '../domain/repositories/IFieldRepository';
import { ProductionUnit } from '../domain/entities/ProductionUnit';
import { CreateProductionUnitsBulkUseCase } from '../application/use-cases/production-unit/CreateProductionUnitsBulkUseCase';

describe('CreateProductionUnitsBulkUseCase', () => {
  let repo: jest.Mocked<IProductionUnitRepository>;
  let fieldRepo: jest.Mocked<IFieldRepository>;

  const baseInput = {
    name: 'PU',
    cropName: 'Frumento',
    cropType: '001',
    variety: 'Bolero',
    protocoll: 'Bio',
    protectionStructure: 'N',
    startDate: new Date('2025-01-01'),
    floweringDate: null,
    harvestingDate: null,
    endDate: new Date('2025-12-31'),
    acquaTotalePeridoL: 0,
  };

  beforeEach(() => {
    repo = {
      createBulk: jest.fn(),
    } as unknown as jest.Mocked<IProductionUnitRepository>;
    fieldRepo = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<IFieldRepository>;
  });

  it('rejects empty fieldId in allocations', async () => {
    fieldRepo.findById.mockResolvedValue({
      id: 'field-1',
      companyId: 'company-1',
      name: 'Campo 1',
    } as Awaited<ReturnType<IFieldRepository['findById']>>);

    const useCase = new CreateProductionUnitsBulkUseCase(repo, fieldRepo);
    await expect(
      useCase.execute({
        productionUnits: [
          {
            ...baseInput,
            allocations: [
              { fieldId: 'field-1', areaHa: 1.5 },
              { fieldId: '', areaHa: 2 },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'FIELD_ID_REQUIRED' });
    expect(repo.createBulk).not.toHaveBeenCalled();
  });

  it('rejects duplicate fieldId in the same production unit', async () => {
    fieldRepo.findById.mockResolvedValue({
      id: 'field-1',
      companyId: 'company-1',
      name: 'Campo 1',
    } as Awaited<ReturnType<IFieldRepository['findById']>>);

    const useCase = new CreateProductionUnitsBulkUseCase(repo, fieldRepo);
    await expect(
      useCase.execute({
        productionUnits: [
          {
            ...baseInput,
            allocations: [
              { fieldId: 'field-1', areaHa: 1.5 },
              { fieldId: 'field-1', areaHa: 2 },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_FIELD_ALLOCATION' });
    expect(repo.createBulk).not.toHaveBeenCalled();
  });

  it('rejects when field does not exist', async () => {
    fieldRepo.findById.mockResolvedValue(null);

    const useCase = new CreateProductionUnitsBulkUseCase(repo, fieldRepo);
    await expect(
      useCase.execute({
        productionUnits: [
          {
            ...baseInput,
            allocations: [{ fieldId: 'missing-field', areaHa: 3.5 }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_FOUND' });
    expect(repo.createBulk).not.toHaveBeenCalled();
  });

  it('creates production units when allocations are valid', async () => {
    fieldRepo.findById.mockResolvedValue({
      id: 'field-1',
      companyId: 'company-1',
      name: 'Campo 1',
    } as Awaited<ReturnType<IFieldRepository['findById']>>);

    const createdUnit = ProductionUnit.create({
      name: baseInput.name,
      cropName: baseInput.cropName,
      cropType: baseInput.cropType,
      variety: baseInput.variety,
      protocoll: baseInput.protocoll,
      areaHa: 3.5,
      protectionStructure: baseInput.protectionStructure,
      startDate: baseInput.startDate,
      floweringDate: baseInput.floweringDate,
      harvestingDate: baseInput.harvestingDate,
      endDate: baseInput.endDate,
      occupazione: null,
      destinazioneDiUso: null,
      acquaTotalePeridoL: 0,
    });
    repo.createBulk.mockResolvedValue([createdUnit]);

    const useCase = new CreateProductionUnitsBulkUseCase(repo, fieldRepo);
    const result = await useCase.execute({
      productionUnits: [
        {
          ...baseInput,
          allocations: [{ fieldId: 'field-1', areaHa: 3.5 }],
        },
      ],
    });

    expect(result.count).toBe(1);
    expect(repo.createBulk).toHaveBeenCalledTimes(1);
  });
});

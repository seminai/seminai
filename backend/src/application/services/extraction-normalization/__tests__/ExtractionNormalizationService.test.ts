import { mock } from 'jest-mock-extended';
import { IFieldRepository } from '../../../../domain/repositories/IFieldRepository';
import { IProductionUnitRepository } from '../../../../domain/repositories/IProductionUnitRepository';
import { ExtractionNormalizationService } from '../ExtractionNormalizationService';
import type {
  FieldExtracted,
  ProductionUnitExtracted,
} from '../../../../infrastructure/services/agents/dosage_agent_react/tools/file-extraction-types';

const COMPANY_ID = 'company-1';

function buildField(overrides: Partial<FieldExtracted> = {}): FieldExtracted {
  return {
    name: 'Vigna A',
    foglio: '12',
    particella: '34',
    comune: 'Verona',
    usiSuolo: ['Vite'],
    sauHa: 2,
    ...overrides,
  };
}

function buildProductionUnit(
  overrides: Partial<ProductionUnitExtracted> = {},
): ProductionUnitExtracted {
  return {
    name: 'UP Vite',
    cropType: 'Da vino',
    protocoll: 'Convenzionale',
    cycles: [
      { cropName: 'Vite', variety: 'Sangiovese', startDate: '2026-04-01', endDate: '2026-10-15' },
    ],
    allocations: [{ foglio: '12', particella: '34' }],
    areaHa: 2,
    ...overrides,
  };
}

describe('ExtractionNormalizationService', () => {
  it('marks all fields as new when none exists in repository', async () => {
    const fieldRepo = mock<IFieldRepository>();
    const puRepo = mock<IProductionUnitRepository>();
    fieldRepo.findByCadastralReference.mockResolvedValue(null);
    const service = new ExtractionNormalizationService(fieldRepo, puRepo);

    const actual = await service.normalize({
      companyId: COMPANY_ID,
      raw: { fields: [buildField()], productionUnits: [buildProductionUnit()] },
    });

    expect(actual.stats.fieldsNew).toBe(1);
    expect(actual.stats.fieldsExisting).toBe(0);
    expect(actual.stats.fieldsOccupied).toBe(0);
    expect(actual.fields[0].status).toBe('new');
    expect(actual.productionUnits).toHaveLength(1);
    expect(puRepo.findOverlappingByField).not.toHaveBeenCalled();
  });

  it('marks existing fields and never queries overlap when no UP is allocated', async () => {
    const fieldRepo = mock<IFieldRepository>();
    const puRepo = mock<IProductionUnitRepository>();
    fieldRepo.findByCadastralReference.mockResolvedValue({
      id: 'field-existing-1',
    } as unknown as Awaited<ReturnType<IFieldRepository['findByCadastralReference']>>);
    puRepo.findOverlappingByField.mockResolvedValue([]);
    const service = new ExtractionNormalizationService(fieldRepo, puRepo);

    const actual = await service.normalize({
      companyId: COMPANY_ID,
      raw: { fields: [buildField()], productionUnits: [] },
    });

    expect(actual.stats.fieldsExisting).toBe(1);
    expect(actual.fields[0].existingFieldId).toBe('field-existing-1');
    expect(puRepo.findOverlappingByField).not.toHaveBeenCalled();
  });

  it('marks fields as occupied when an overlapping UP exists', async () => {
    const fieldRepo = mock<IFieldRepository>();
    const puRepo = mock<IProductionUnitRepository>();
    fieldRepo.findByCadastralReference.mockResolvedValue({
      id: 'field-existing-1',
    } as unknown as Awaited<ReturnType<IFieldRepository['findByCadastralReference']>>);
    puRepo.findOverlappingByField.mockResolvedValue([
      {
        productionUnitId: 'pu-existing-1',
        productionUnitName: 'UP Pre-esistente',
        cropName: 'Vite',
        startDate: new Date('2026-03-01'),
        endDate: new Date('2026-11-01'),
        areaHaOnField: 2,
      },
    ]);
    const service = new ExtractionNormalizationService(fieldRepo, puRepo);

    const actual = await service.normalize({
      companyId: COMPANY_ID,
      raw: { fields: [buildField()], productionUnits: [buildProductionUnit()] },
    });

    expect(actual.stats.fieldsOccupied).toBe(1);
    expect(actual.fields[0].status).toBe('occupied');
    expect(actual.fields[0].occupiedBy).toHaveLength(1);
    expect(actual.fields[0].occupiedBy?.[0].productionUnitId).toBe('pu-existing-1');
  });

  it('produces deterministic output on repeated runs with the same input', async () => {
    const fieldRepo = mock<IFieldRepository>();
    const puRepo = mock<IProductionUnitRepository>();
    fieldRepo.findByCadastralReference.mockResolvedValue(null);
    const service = new ExtractionNormalizationService(fieldRepo, puRepo);

    const raw = {
      fields: [buildField(), buildField({ particella: '35', name: 'Vigna B' })],
      productionUnits: [
        buildProductionUnit({
          allocations: [
            { foglio: '12', particella: '34' },
            { foglio: '12', particella: '35' },
          ],
          areaHa: 3,
        }),
      ],
    };
    const first = await service.normalize({ companyId: COMPANY_ID, raw });
    const second = await service.normalize({ companyId: COMPANY_ID, raw });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.productionUnits).toHaveLength(1);
    expect(first.productionUnits[0].allocations).toHaveLength(2);
  });
});

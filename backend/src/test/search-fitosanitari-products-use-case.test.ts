import fs from 'fs';
import { SearchFitosanitariProductsUseCase } from '../application/use-cases/product/SearchFitosanitariProductsUseCase';

describe('SearchFitosanitariProductsUseCase', () => {
  beforeEach(() => {
    jest.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify([
        {
          num_registrazione: '000001',
          denominazione_prodotto: 'ENOVIT',
          sostanze_attive: 'THIOPHANATE-METHYL',
          stato_amministrativo: 'Revocato',
        },
        {
          num_registrazione: '001234',
          denominazione_prodotto: 'RAME VERDE',
          sostanze_attive: 'RAME OSSICLORURO',
          stato_amministrativo: 'Autorizzato',
        },
      ]),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('filters ministry products by active ingredient', () => {
    const useCase = new SearchFitosanitariProductsUseCase();
    const actualResult = useCase.execute({ activeIngredient: 'rame' });
    expect(actualResult.products).toHaveLength(1);
    expect(actualResult.products[0]).toMatchObject({
      name: 'RAME VERDE',
      registrationNumber: '001234',
      activeIngredient: 'RAME OSSICLORURO',
    });
  });

  it('filters ministry products by registration number without leading zeros', () => {
    const useCase = new SearchFitosanitariProductsUseCase();
    const actualResult = useCase.execute({ registrationNumber: '1' });
    expect(actualResult.products[0]?.name).toBe('ENOVIT');
  });

  it('uses the general query for full registration numbers', () => {
    const useCase = new SearchFitosanitariProductsUseCase();
    const actualResult = useCase.execute({ q: '000001' });
    expect(actualResult.products[0]?.name).toBe('ENOVIT');
  });
});

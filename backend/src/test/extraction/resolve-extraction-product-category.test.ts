import { CompanyKind, ProductCategory } from '@prisma/client';
import {
  isValidExtractionProductCategory,
  resolveExtractionProductCategory,
} from '../../application/use-cases/extraction/resolve-extraction-product-category';

describe('resolveExtractionProductCategory', () => {
  it('maps manufacturing enum values to ProductCategory', () => {
    const resolved = resolveExtractionProductCategory('EQUIPMENT', CompanyKind.MANUFACTURING);
    expect(resolved).toEqual({
      category: ProductCategory.EQUIPMENT,
      type: 'Generico',
    });
  });

  it('maps custom manufacturing types to OTHER + type', () => {
    const resolved = resolveExtractionProductCategory('Lamiera', CompanyKind.MANUFACTURING);
    expect(resolved).toEqual({
      category: ProductCategory.OTHER,
      type: 'Lamiera',
    });
  });

  it('keeps agricultural mapping via mapToProductCategory', () => {
    const resolved = resolveExtractionProductCategory('PHYTOSANITARY', CompanyKind.AGRICULTURAL);
    expect(resolved.category).toBe(ProductCategory.PESTICIDE);
    expect(resolved.type).toBe('Generico');
  });
});

describe('isValidExtractionProductCategory', () => {
  it('accepts agricultural whitelist only for agricultural companies', () => {
    expect(isValidExtractionProductCategory('FERTILIZER', CompanyKind.AGRICULTURAL)).toBe(true);
    expect(isValidExtractionProductCategory('Lamiera', CompanyKind.AGRICULTURAL)).toBe(false);
  });

  it('accepts enum and custom values for manufacturing companies', () => {
    expect(isValidExtractionProductCategory('PACKAGING', CompanyKind.MANUFACTURING)).toBe(true);
    expect(isValidExtractionProductCategory('Lamiera', CompanyKind.MANUFACTURING)).toBe(true);
    expect(isValidExtractionProductCategory('', CompanyKind.MANUFACTURING)).toBe(false);
  });
});

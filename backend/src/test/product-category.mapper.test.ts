import { ProductCategory } from '@prisma/client';
import { mapToProductCategory } from '../application/use-cases/product/product-category.mapper';

describe('mapToProductCategory', () => {
  it('maps OTHER and ALTRO to ProductCategory.OTHER', () => {
    expect(mapToProductCategory('OTHER')).toBe(ProductCategory.OTHER);
    expect(mapToProductCategory('ALTRO')).toBe(ProductCategory.OTHER);
    expect(mapToProductCategory(ProductCategory.OTHER)).toBe(ProductCategory.OTHER);
  });

  it('maps registration number to PESTICIDE regardless of input category', () => {
    expect(mapToProductCategory('OTHER', '12345')).toBe(ProductCategory.PESTICIDE);
  });

  it('falls back to FERTILIZER for unknown categories', () => {
    expect(mapToProductCategory('UNKNOWN')).toBe(ProductCategory.FERTILIZER);
  });

  it('maps direct enum values', () => {
    expect(mapToProductCategory('SEED')).toBe(ProductCategory.SEED);
    expect(mapToProductCategory('PACKAGING')).toBe(ProductCategory.PACKAGING);
  });
});

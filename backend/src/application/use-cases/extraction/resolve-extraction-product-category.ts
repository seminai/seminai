import { CompanyKind, ProductCategory } from '@prisma/client';
import { mapToProductCategory } from '../product/product-category.mapper';

const MANUFACTURING_ENUM_VALUES = new Set<string>(['EQUIPMENT', 'PACKAGING', 'OTHER']);

export interface ResolvedExtractionProductCategory {
  readonly category: ProductCategory;
  readonly type: string;
}

export function isManufacturingEnumCategory(value: string): boolean {
  return MANUFACTURING_ENUM_VALUES.has(value.toUpperCase());
}

export function resolveExtractionProductCategory(
  productCategory: string,
  companyKind: CompanyKind,
  registrationNumber?: string | null,
): ResolvedExtractionProductCategory {
  const trimmed = productCategory.trim();
  if (companyKind === CompanyKind.MANUFACTURING) {
    if (isManufacturingEnumCategory(trimmed)) {
      return {
        category: trimmed.toUpperCase() as ProductCategory,
        type: 'Generico',
      };
    }
    return {
      category: ProductCategory.OTHER,
      type: trimmed || 'Generico',
    };
  }
  const mappedCategory = mapToProductCategory(trimmed, registrationNumber ?? null);
  return {
    category: mappedCategory,
    type: 'Generico',
  };
}

export function isValidExtractionProductCategory(
  productCategory: string,
  companyKind: CompanyKind,
): boolean {
  const trimmed = productCategory.trim();
  if (!trimmed) return false;
  if (companyKind === CompanyKind.MANUFACTURING) {
    return isManufacturingEnumCategory(trimmed) || trimmed.length > 0;
  }
  return trimmed === 'PHYTOSANITARY' || trimmed === 'FERTILIZER' || trimmed === 'OTHER';
}

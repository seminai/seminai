import { ProductCategory } from '@prisma/client';

/**
 * Maps input category strings to valid ProductCategory enum values.
 * Handles legacy/alternative category names for backward compatibility.
 */
export function mapToProductCategory(
  input: string | ProductCategory | undefined | null,
  registrationNumber?: string | null,
): ProductCategory {
  if (registrationNumber && registrationNumber.trim().length > 0) {
    return ProductCategory.PESTICIDE;
  }
  if (!input) {
    return ProductCategory.FERTILIZER;
  }

  const normalized = String(input).toUpperCase().trim();

  const categoryMap: Record<string, ProductCategory> = {
    // Direct mappings
    FERTILIZER: ProductCategory.FERTILIZER,
    PESTICIDE: ProductCategory.PESTICIDE,
    SEED: ProductCategory.SEED,
    HARVEST: ProductCategory.HARVEST,
    EQUIPMENT: ProductCategory.EQUIPMENT,
    PACKAGING: ProductCategory.PACKAGING,
    OTHER: ProductCategory.OTHER,
    // Legacy/alternative mappings
    PHYTOSANITARY: ProductCategory.PESTICIDE,
    FITOFARMACO: ProductCategory.PESTICIDE,
    AGROFARMACO: ProductCategory.PESTICIDE,
    FITO: ProductCategory.PESTICIDE,
    PPP: ProductCategory.PESTICIDE, // Plant Protection Product
    CONCIME: ProductCategory.FERTILIZER,
    FERTILIZZANTE: ProductCategory.FERTILIZER,
    SEMENTE: ProductCategory.SEED,
    SEMENTI: ProductCategory.SEED,
    RACCOLTO: ProductCategory.HARVEST,
    ATTREZZATURA: ProductCategory.EQUIPMENT,
    CONFEZIONAMENTO: ProductCategory.PACKAGING,
    ALTRO: ProductCategory.OTHER,
  };

  return categoryMap[normalized] ?? ProductCategory.FERTILIZER;
}

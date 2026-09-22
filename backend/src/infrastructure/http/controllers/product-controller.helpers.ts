import { ProductCategory } from '@prisma/client';
import { FitosanitariLookupService } from '../../services/utils/FitosanitariLookupService';

export type ExtractedProductCategory = 'PHYTOSANITARY' | 'FERTILIZER' | 'OTHER';

interface EnrichableProduct {
  readonly labelMetadata?: unknown;
  readonly category?: ProductCategory | string | null;
  readonly registrationNumber?: string | null;
  readonly name?: string | null;
  readonly administrativeStatus?: string | null;
}

export function withPrincipioAttivo<T extends EnrichableProduct>(product: T) {
  const meta = product.labelMetadata as { principio_attivo?: string } | null | undefined;
  const isPesticide = product.category === ProductCategory.PESTICIDE;
  const fitosanitari = isPesticide ? FitosanitariLookupService.getInstance() : null;
  const principioAttivoFromLabel = meta?.principio_attivo ?? null;
  const principioAttivoFromDataset =
    principioAttivoFromLabel || !fitosanitari
      ? null
      : fitosanitari.lookupActiveIngredients(
          product.registrationNumber ?? null,
          product.name ?? null,
        );
  const freshStatus = fitosanitari
    ? fitosanitari.lookupStatus(product.registrationNumber ?? null, product.name ?? null)
    : null;
  return {
    ...product,
    principioAttivo: principioAttivoFromLabel ?? principioAttivoFromDataset,
    administrativeStatus: freshStatus ?? product.administrativeStatus ?? null,
  };
}

function normalizeProductNameKey(productName: string): string {
  return productName.trim().toUpperCase();
}

function toExtractedProductCategory(value: string): ExtractedProductCategory {
  return value === 'PHYTOSANITARY' || value === 'FERTILIZER' ? value : 'OTHER';
}

export function resolveExtractedCategory(params: {
  readonly entryCategory: string;
  readonly registrationNumber: string | null;
  readonly productName: string;
  readonly llmCategoryByName: ReadonlyMap<string, ExtractedProductCategory>;
}): ExtractedProductCategory {
  if (params.registrationNumber?.trim()) return 'PHYTOSANITARY';
  const category = toExtractedProductCategory(params.entryCategory);
  if (category !== 'OTHER') return category;
  return params.llmCategoryByName.get(normalizeProductNameKey(params.productName)) ?? 'OTHER';
}

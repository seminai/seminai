import { useMemo } from 'react';
import { useGetProductsMe } from '@/generated/api/products/products';
import { useCompanyKind } from '@/hooks/use-company-kind';
import { extractArray } from '@/lib/api-response';
import {
  AGRICULTURAL_CATEGORY_OPTIONS,
  buildManufacturingCategoryOptions,
  defaultAgriculturalCategory,
  defaultManufacturingCategory,
  type ExtractionCategoryOption,
} from '@/lib/extraction-product-category';

interface UseCompanyProductCategoryOptionsResult {
  readonly isManufacturing: boolean;
  readonly isLoading: boolean;
  readonly categoryOptions: readonly ExtractionCategoryOption[];
  readonly defaultCategory: string;
}

export function useCompanyProductCategoryOptions(
  companyId: string,
): UseCompanyProductCategoryOptionsResult {
  const { isAgricultural, isLoading: isKindLoading } = useCompanyKind(companyId);
  const { data: productsResponse, isLoading: isProductsLoading } = useGetProductsMe();

  const companyProducts = useMemo(() => {
    if (!productsResponse?.data) return [];
    return extractArray(productsResponse.data, 'products').filter((item) => {
      const product = item as Record<string, unknown>;
      const warehouse = product.warehouse as Record<string, unknown> | null;
      const company = warehouse?.company as Record<string, unknown> | null;
      return company?.id === companyId;
    });
  }, [companyId, productsResponse]);

  const isManufacturing = !isAgricultural;

  const categoryOptions = useMemo<readonly ExtractionCategoryOption[]>(() => {
    if (isManufacturing) {
      return buildManufacturingCategoryOptions(companyProducts);
    }
    return AGRICULTURAL_CATEGORY_OPTIONS;
  }, [companyProducts, isManufacturing]);

  const defaultCategory = useMemo(
    () =>
      isManufacturing
        ? defaultManufacturingCategory(categoryOptions)
        : defaultAgriculturalCategory(),
    [categoryOptions, isManufacturing],
  );

  return {
    isManufacturing,
    isLoading: isKindLoading || isProductsLoading,
    categoryOptions,
    defaultCategory,
  };
}

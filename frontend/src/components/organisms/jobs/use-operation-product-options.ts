import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useGetProductsMe } from '@/generated/api/products/products';
import { customFetch } from '@/lib/api-client';
import { extractArray } from '@/lib/api-response';

export type OperationProductSource = 'warehouse' | 'ministry';

export interface OperationProductOption {
  readonly id: string;
  readonly source: OperationProductSource;
  readonly productId?: string;
  readonly name: string;
  readonly registrationNumber: string;
  readonly activeIngredient: string;
  readonly availableQuantity: number | null;
  readonly unit: string;
  readonly warehouseId?: string;
  readonly administrativeStatus?: string;
}

interface MinistrySearchResponse {
  readonly status: string;
  readonly data: {
    readonly products: readonly Record<string, unknown>[];
  };
}

function toText(value: unknown): string {
  return String(value ?? '').trim();
}

function readNestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : null;
}

function getCurrentStock(product: Record<string, unknown>): { quantity: number; unit: string } {
  const stocks = Array.isArray(product.stocks) ? product.stocks : [];
  const quantity = stocks.reduce((sum, item) => {
    const stock = item as Record<string, unknown>;
    const rawQuantity = Number(stock.quantity ?? 0);
    const type = toText(stock.type).toUpperCase();
    return sum + (type === 'OUT' ? -rawQuantity : rawQuantity);
  }, 0);
  const firstStock = stocks[0] as Record<string, unknown> | undefined;
  return {
    quantity: Math.round(quantity * 100) / 100,
    unit: toText(firstStock?.unitOfMeasureQuantity) || 'L',
  };
}

function mapWarehouseProduct(product: Record<string, unknown>): OperationProductOption | null {
  const warehouse = readNestedRecord(product, 'warehouse');
  const { quantity, unit } = getCurrentStock(product);
  const id = toText(product.id);
  const name = toText(product.name);
  if (!id || !name || quantity <= 0) return null;
  return {
    id: `warehouse:${id}`,
    source: 'warehouse',
    productId: id,
    name,
    registrationNumber: toText(product.registrationNumber),
    activeIngredient: toText(product.principioAttivo),
    availableQuantity: quantity,
    unit,
    warehouseId: toText(product.warehouseId ?? warehouse?.id),
    administrativeStatus: toText(product.administrativeStatus),
  };
}

function mapMinistryProduct(product: Record<string, unknown>): OperationProductOption | null {
  const registrationNumber = toText(product.registrationNumber);
  const name = toText(product.name);
  if (!registrationNumber || !name) return null;
  return {
    id: `ministry:${registrationNumber}:${name}`,
    source: 'ministry',
    name,
    registrationNumber,
    activeIngredient: toText(product.activeIngredient),
    availableQuantity: null,
    unit: 'L',
    administrativeStatus: toText(product.administrativeStatus),
  };
}

function optionMatchesCompany(product: Record<string, unknown>, companyId: string): boolean {
  const warehouse = readNestedRecord(product, 'warehouse');
  const company = readNestedRecord(warehouse, 'company');
  return toText(company?.id) === companyId;
}

export function useOperationProductOptions(companyId: string | null, search: string) {
  const productsQuery = useGetProductsMe(undefined, {
    query: { enabled: Boolean(companyId) },
  });
  const ministryQuery = useQuery({
    queryKey: ['products', 'ministry-search', search],
    queryFn: () =>
      customFetch<MinistrySearchResponse>({
        url: '/products/ministry-search',
        method: 'GET',
        params: { q: search, limit: '50' },
      }),
    enabled: search.trim().length >= 2,
    staleTime: 5 * 60_000,
  });

  const options = useMemo(() => {
    const warehouseOptions = extractArray(productsQuery.data?.data, 'products')
      .filter((product) => (companyId ? optionMatchesCompany(product, companyId) : false))
      .map(mapWarehouseProduct)
      .filter((item): item is OperationProductOption => item !== null);
    const ministryOptions = extractArray(ministryQuery.data, 'products')
      .map(mapMinistryProduct)
      .filter((item): item is OperationProductOption => item !== null);
    const existingRegistrations = new Set(
      warehouseOptions.map((item) => item.registrationNumber).filter(Boolean),
    );
    return [
      ...warehouseOptions,
      ...ministryOptions.filter((item) => !existingRegistrations.has(item.registrationNumber)),
    ];
  }, [companyId, ministryQuery.data, productsQuery.data]);

  return {
    options,
    isLoading: productsQuery.isLoading || ministryQuery.isLoading,
  };
}

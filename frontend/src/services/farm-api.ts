import { customFetch } from '@/lib/api-client';
export interface Movement {
  productId: string;
  type: 'IN' | 'OUT';
  quantity: number;
  unit: string;
  price: number;
  documentReference?: string;
}
export interface OperationInput {
  companyId: string;
  date: string;
  reason: string;
  movements: Movement[];
  job?: {
    productionUnitId: string;
    category: string;
    quantity: number;
    unit: string;
    note?: string;
  };
}
export interface FarmOperation {
  id: string;
  version: number;
  status: string;
  connectionId: string | null;
  createdAt: string;
  payload: OperationInput;
  preview: {
    negativeStock: boolean;
    balances: Array<{
      productId: string;
      name: string;
      warehouse: string;
      unit: string;
      before: number;
      after: number;
    }>;
  };
}
export interface Product {
  id: string;
  name: string;
  warehouse: { id: string; name: string };
  stocks: Array<{
    type: string;
    quantity: number;
    unitOfMeasureQuantity: string;
    quantityConverted: number | null;
    unitMeasureConverted: string | null;
  }>;
}
export interface FarmRecord {
  id: string;
  name?: string;
  quantity?: number;
  type?: string;
  reason?: string;
  occurredAt?: string;
  dateOfOpeation?: string;
  category?: string;
  unitOfMeasureQuantity?: string;
  product?: { name: string };
  productionUnit?: { name: string };
}
export async function farmRequest<T>(url: string, method = 'GET', data?: unknown): Promise<T> {
  const result = await customFetch<{ data: T }>({ url, method, data });
  return result.data;
}
export function getFarmCatalog<T>(
  companyId: string,
  kind: string,
  page = 0,
  search = '',
): Promise<T[]> {
  return farmRequest(
    `/farm/catalog?companyId=${encodeURIComponent(companyId)}&kind=${kind}&offset=${page * 100}&search=${encodeURIComponent(search)}`,
  );
}

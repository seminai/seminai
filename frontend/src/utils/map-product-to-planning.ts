import type { PlanningProduct } from '@/types/planning';

interface StockRecord {
  readonly quantity?: number;
  readonly unitOfMeasureQuantity?: string;
}

function sumStockQuantity(item: Record<string, unknown>): { quantity: number; unit: string } {
  const stocks = item.stocks as readonly StockRecord[] | undefined;
  if (!stocks || stocks.length === 0) {
    return {
      quantity: (item.quantity as number) ?? 0,
      unit: (item.unitOfMeasure as string) ?? (item.quantityUnitOfMeasure as string) ?? 'L',
    };
  }
  const total = stocks.reduce((sum, s) => sum + (s.quantity ?? 0), 0);
  const unit = stocks[0]?.unitOfMeasureQuantity ?? 'L';
  return { quantity: Math.round(total * 100) / 100, unit };
}

export function mapProductToPlanning(item: Record<string, unknown>): PlanningProduct {
  const { quantity, unit } = sumStockQuantity(item);
  return {
    productName: (item.name as string) ?? (item.productName as string) ?? '',
    registrationNumber: (item.registrationNumber as string) ?? '',
    quantity,
    quantityUnitOfMeasure: unit,
  };
}

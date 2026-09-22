import type { ExtractionData, FieldBulkPreview, ProductionUnitPreview, StockPreviewEntry } from '@/types/extraction';

export function cloneExtractionData(data: ExtractionData): ExtractionData {
  return JSON.parse(JSON.stringify(data)) as ExtractionData;
}

export function applyFieldRows(baseRows: readonly FieldBulkPreview[], rows: string[][]): readonly FieldBulkPreview[] {
  return baseRows.map((base, index) => {
    const row = rows[index] ?? [];
    return {
      ...base,
      name: row[0]?.trim() || base.name,
      foglio: nullableText(row[1]),
      particella: nullableText(row[2]),
      city: nullableText(row[3]),
      sauHa: nullableNumber(row[4]),
      superficieCatastaleMq: nullableNumber(row[5]),
      uso: nullableText(row[6]),
      gisHa: nullableNumber(row[7]),
      sezione: nullableText(row[8]),
      subalterno: nullableText(row[9]),
      region: nullableText(row[10]),
      qualita: nullableText(row[11]),
      soilType: nullableText(row[12]),
      address: nullableText(row[13]),
      cap: nullableText(row[14]),
      inizioConduzione: nullableText(row[15]),
      fineConduzione: nullableText(row[16]),
      latitude: nullableNumber(row[17]),
      longitude: nullableNumber(row[18]),
    };
  });
}

export function applyProductionUnitRows(
  baseRows: readonly ProductionUnitPreview[],
  rows: string[][],
): readonly ProductionUnitPreview[] {
  return baseRows.map((base, index) => {
    const row = rows[index] ?? [];
    return {
      ...base,
      name: row[0]?.trim() || base.name,
      cropName: nullableText(row[1]),
      variety: nullableText(row[3]),
      areaHa: nullableNumber(row[4]),
      startDate: nullableText(row[5]),
      cropType: nullableText(row[6]),
      protocoll: nullableText(row[7]),
      protectionStructure: nullableText(row[8]),
      endDate: nullableText(row[9]),
    };
  });
}

export function applyStockRows(baseRows: readonly StockPreviewEntry[], rows: string[][]): readonly StockPreviewEntry[] {
  return baseRows.map((base, index) => {
    const row = rows[index] ?? [];
    return {
      ...base,
      name: row[0]?.trim() || base.name,
      category: nullableText(row[4]) ?? base.category,
      registrationNumber: nullableText(row[5]),
      stock: {
        ...base.stock,
        quantity: nullableNumber(row[1]) ?? base.stock.quantity,
        unitOfMeasureQuantity: nullableText(row[2]) ?? base.stock.unitOfMeasureQuantity,
        price: nullableNumber(row[3]) ?? base.stock.price,
        type: nullableStockMovement(row[6]) ?? base.stock.type,
        ddtCode: nullableText(row[7]) ?? base.stock.ddtCode,
        ddtDate: nullableText(row[8]) ?? base.stock.ddtDate,
        invoiceCode: nullableText(row[9]),
        companySupplierName: nullableText(row[10]),
      },
    };
  });
}

function nullableText(value?: string): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function nullableNumber(value?: string): number | null {
  const raw = value?.trim().replace(',', '.') ?? '';
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableStockMovement(value?: string): 'IN' | 'OUT' | null {
  const trimmed = value?.trim().toUpperCase();
  if (trimmed === 'IN' || trimmed === 'OUT') return trimmed;
  return null;
}

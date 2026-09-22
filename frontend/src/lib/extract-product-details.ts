import type { StockRow } from '@/components/molecules/stock-movements-table';

export interface ProductDosage {
  readonly coltura: string;
  readonly malattia: string | null;
  readonly doseMin: number | null;
  readonly doseMax: number | null;
  readonly doseUm: string | null;
  readonly intervalloSicurezzaGiorni: number | null;
}

export interface FertilizerComposition {
  readonly nitrogen: number | null;
  readonly phosphorus: number | null;
  readonly potassium: number | null;
  readonly magnesium: number | null;
  readonly calcium: number | null;
  readonly sulfur: number | null;
  readonly boron: number | null;
  readonly unitOfFertilizer: string | null;
}

export interface ProductDetails {
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly type: string | null;
  readonly description: string | null;
  readonly principioAttivo: string | null;
  readonly formulazione: string | null;
  readonly composizione: string | null;
  readonly meccanismoFrac: string | null;
  readonly titolare: string | null;
  readonly caratteristiche: string | null;
  readonly labelUrl: string | null;
  readonly unitOfMeasure: string | null;
  readonly fertilizerComposition: FertilizerComposition;
  readonly dosaggi: readonly ProductDosage[];
}

type Raw = Record<string, unknown>;

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function asNumber(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return value;
}

function asRecord(value: unknown): Raw | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Raw;
}

function mapDosaggi(raw: unknown): readonly ProductDosage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): ProductDosage | null => {
      const entry = asRecord(item);
      if (!entry) return null;
      const coltura = asString(entry.coltura);
      if (!coltura) return null;
      return {
        coltura,
        malattia: asString(entry.malattia),
        doseMin: asNumber(entry.dose_minima),
        doseMax: asNumber(entry.dose_massima),
        doseUm: asString(entry.dose_um),
        intervalloSicurezzaGiorni: asNumber(entry.intervallo_sicurezza_giorni),
      };
    })
    .filter((entry): entry is ProductDosage => entry !== null);
}

function buildFertilizerComposition(raw: Raw): FertilizerComposition {
  return {
    nitrogen: asNumber(raw.nitrogen),
    phosphorus: asNumber(raw.phosphorus),
    potassium: asNumber(raw.potassium),
    magnesium: asNumber(raw.magnesium),
    calcium: asNumber(raw.calcium),
    sulfur: asNumber(raw.sulfur),
    boron: asNumber(raw.boron),
    unitOfFertilizer: asString(raw.unitOfFertilizer),
  };
}

function resolveUnitOfMeasure(
  category: string,
  composition: FertilizerComposition,
  stocks: readonly StockRow[],
): string | null {
  if (category === 'FERTILIZER' && composition.unitOfFertilizer) {
    return composition.unitOfFertilizer;
  }
  const latest = stocks.find((s) => s.unitOfMeasure && s.unitOfMeasure !== '-');
  return latest?.unitOfMeasure ?? null;
}

export function extractProductDetails(
  raw: unknown,
  stocks: readonly StockRow[],
): ProductDetails {
  const product = asRecord(raw) ?? {};
  const label = asRecord(product.labelMetadata) ?? {};
  const category = typeof product.category === 'string' ? product.category : '';
  const fertilizerComposition = buildFertilizerComposition(product);
  return {
    sku: asString(product.sku),
    barcode: asString(product.barcode),
    type: asString(product.type),
    description: asString(product.description),
    principioAttivo: asString(product.principioAttivo) ?? asString(label.principio_attivo),
    formulazione: asString(label.formulazione),
    composizione: asString(label.composizione),
    meccanismoFrac: asString(label.meccanismo_azione_frac),
    titolare: asString(label.titolare),
    caratteristiche: asString(label.caratteristiche),
    labelUrl: asString(product.labelUrl),
    unitOfMeasure: resolveUnitOfMeasure(category, fertilizerComposition, stocks),
    fertilizerComposition,
    dosaggi: mapDosaggi(label.dosaggi_dettagliati),
  };
}

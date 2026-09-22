import type { Label } from '@/generated/schemas/label';
import type { LabelDoseDetail } from '@/generated/schemas/labelDoseDetail';
import type { FertilizerProduct } from '@/types/fertilizer-label';
import { extractArray, extractObject } from '@/lib/api-response';

/**
 * Product label (etichetta) view types. The generated `Label`/summary schemas omit `category`
 * and the fertilizer branch returned at runtime, so these hand-written types layer the missing
 * fields on top of the generated base and parse the API envelope defensively.
 */

export type LabelCategory = 'FITO' | 'PESTICIDE' | 'FERTILIZER';

export interface LabelResistance {
  readonly testo_completo?: string | null;
  readonly raccomandazioni?: string | null;
  readonly n_max_applicazioni?: number | null;
  readonly n_min_applicazioni?: number | null;
  readonly n_max_applicazioni_um?: string | null;
  readonly n_min_applicazioni_um?: string | null;
}

/** Generated `Label` augmented with the fields the BE returns but the schema omits. */
export type LabelInner = Label & {
  readonly prodotto_fertilizzante_ue?: FertilizerProduct | null;
  readonly resistenze?: readonly LabelResistance[] | null;
};

export type { LabelDoseDetail };

export interface LabelSummaryRow {
  readonly id: string;
  readonly productName: string;
  readonly registrationNumber: string;
  readonly category: LabelCategory | null;
  readonly isVerified: boolean;
  readonly extractionConfidence: number | null;
  readonly createdAt: string | null;
}

export interface LabelDetailView {
  readonly id: string;
  readonly productName: string;
  readonly registrationNumber: string;
  readonly sourceUrl: string | null;
  readonly rawText: string | null;
  readonly isVerified: boolean;
  readonly category: LabelCategory | null;
  readonly label: LabelInner;
  readonly isFertilizer: boolean;
}

function toCategory(value: unknown): LabelCategory | null {
  if (value === 'FITO' || value === 'PESTICIDE' || value === 'FERTILIZER') return value;
  return null;
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Maps a raw summary API envelope to normalized rows. */
export function parseLabelSummaryRows(raw: unknown): LabelSummaryRow[] {
  return extractArray(raw, 'data').map((item) => ({
    id: String(item.id ?? ''),
    productName: String(item.productName ?? ''),
    registrationNumber: String(item.registrationNumber ?? ''),
    category: toCategory(item.category),
    isVerified: item.isVerified === true,
    extractionConfidence: toNumberOrNull(item.extractionConfidence),
    createdAt: toStringOrNull(item.createdAt),
  }));
}

/** Maps a raw detail API envelope to a view model, or null when the id is missing. */
export function parseLabelDetail(raw: unknown): LabelDetailView | null {
  const obj = extractObject(raw);
  if (!obj) return null;
  const id = String(obj.id ?? '');
  if (!id) return null;
  const label = (obj.label && typeof obj.label === 'object' ? obj.label : {}) as LabelInner;
  return {
    id,
    productName: String(obj.productName ?? ''),
    registrationNumber: String(obj.registrationNumber ?? ''),
    sourceUrl: toStringOrNull(obj.sourceUrl),
    rawText: toStringOrNull(obj.rawText),
    isVerified: obj.isVerified === true,
    category: toCategory(obj.category),
    label,
    isFertilizer: Boolean(label.prodotto_fertilizzante_ue),
  };
}

/** Formats an extraction confidence (0–1 ratio or 0–100 percent) as a percentage label. */
export function formatConfidence(value: number | null): string {
  if (value === null) return '—';
  const percent = value <= 1 ? value * 100 : value;
  return `${Math.round(percent)}%`;
}

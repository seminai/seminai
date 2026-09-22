import { CATEGORY_LABELS } from '@/components/organisms/manual-add/products-wizard-types';

export type AgriculturalInvoiceCategory = 'PHYTOSANITARY' | 'FERTILIZER' | 'OTHER';

/** Stored value in extraction rows — agricultural enums or manufacturing enum/custom type. */
export type InvoiceProductCategory = AgriculturalInvoiceCategory | string;

export type ExtractionCategoryOptionGroup = 'enum' | 'custom';

export interface ExtractionCategoryOption {
  readonly value: string;
  readonly label: string;
  readonly group: ExtractionCategoryOptionGroup;
}

export const AGRICULTURAL_CATEGORY_OPTIONS: readonly ExtractionCategoryOption[] = [
  { value: 'PHYTOSANITARY', label: 'PHYTOSANITARY', group: 'enum' },
  { value: 'FERTILIZER', label: 'FERTILIZER', group: 'enum' },
  { value: 'OTHER', label: 'OTHER', group: 'enum' },
] as const;

export const MANUFACTURING_ENUM_VALUES = ['EQUIPMENT', 'PACKAGING', 'OTHER'] as const;

export type ManufacturingEnumCategory = (typeof MANUFACTURING_ENUM_VALUES)[number];

const MANUFACTURING_ENUM_SET = new Set<string>(MANUFACTURING_ENUM_VALUES);

const MANUFACTURING_ENUM_LABELS: Record<ManufacturingEnumCategory, string> = {
  EQUIPMENT: CATEGORY_LABELS.EQUIPMENT,
  PACKAGING: CATEGORY_LABELS.PACKAGING,
  OTHER: CATEGORY_LABELS.OTHER,
};

export const MANUFACTURING_ENUM_OPTIONS: readonly ExtractionCategoryOption[] =
  MANUFACTURING_ENUM_VALUES.map((value) => ({
    value,
    label: MANUFACTURING_ENUM_LABELS[value],
    group: 'enum' as const,
  }));

const AGRICULTURAL_CATEGORY_SET = new Set<string>(['PHYTOSANITARY', 'FERTILIZER', 'OTHER']);

export function isKnownAgriculturalCategory(value: string): value is AgriculturalInvoiceCategory {
  return AGRICULTURAL_CATEGORY_SET.has(value);
}

export function isKnownManufacturingEnum(value: string): value is ManufacturingEnumCategory {
  return MANUFACTURING_ENUM_SET.has(value);
}

interface ProductTypeSource {
  readonly type?: unknown;
  readonly category?: unknown;
}

function normalizeTypeLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed;
}

function isDuplicateOfEnum(typeLabel: string): boolean {
  const upper = typeLabel.toUpperCase();
  if (MANUFACTURING_ENUM_SET.has(upper)) return true;
  const enumLabelMatch = MANUFACTURING_ENUM_OPTIONS.some(
    (option) => option.label.toLowerCase() === typeLabel.toLowerCase(),
  );
  return enumLabelMatch;
}

export function buildManufacturingCategoryOptions(
  products: readonly ProductTypeSource[],
): readonly ExtractionCategoryOption[] {
  const customTypes = new Set<string>();
  for (const product of products) {
    const typeLabel = normalizeTypeLabel(product.type);
    if (!typeLabel || typeLabel === 'Generico') continue;
    if (isDuplicateOfEnum(typeLabel)) continue;
    customTypes.add(typeLabel);
  }

  const customOptions: ExtractionCategoryOption[] = [...customTypes]
    .sort((left, right) => left.localeCompare(right, 'it'))
    .map((value) => ({ value, label: value, group: 'custom' }));

  return [...MANUFACTURING_ENUM_OPTIONS, ...customOptions];
}

export function defaultManufacturingCategory(
  options: readonly ExtractionCategoryOption[],
): string {
  return options[0]?.value ?? 'OTHER';
}

export function defaultAgriculturalCategory(): AgriculturalInvoiceCategory {
  return 'OTHER';
}

export function normalizeProductCategoryValue(
  value: string,
  isManufacturing: boolean,
): InvoiceProductCategory {
  const trimmed = value.trim();
  if (!trimmed) {
    return isManufacturing ? defaultManufacturingCategory(MANUFACTURING_ENUM_OPTIONS) : 'OTHER';
  }
  if (isManufacturing) {
    return trimmed;
  }
  if (isKnownAgriculturalCategory(trimmed)) {
    return trimmed;
  }
  return 'OTHER';
}

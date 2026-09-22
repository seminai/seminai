import { type FieldBulkPreview } from '../../../domain/dtos/file-extraction.dto';
import { normalizeAreaHa } from '../../utils/area-normalization';

/**
 * Raw extracted field shape from FieldCsvAgent / PianoColturalePdfAgent.
 */
export interface ExtractedFieldRaw {
  name: string;
  coordinates?: number[];
  coordinatesGaussBoaga?: number[];
  polygon?: unknown | null;
  polygonGaussBoaga?: unknown | null;
  nation: string | null;
  region: string | null;
  city: string | null;
  address: string | null;
  cap: string | null;
  foglio: string | null;
  particella: string | null;
  subalterno: string | null;
  sezione: string | null;
  superficieCatastaleMq: number | null;
  gisHa: number | null;
  sauHa: number | null;
  variazioneMq: string | null;
  uso: string | null;
  qualita: string | null;
  soilType: string | null;
  ph: number | null;
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
  calcium: number | null;
  magnesium: number | null;
  latitude: number | null;
  longitude: number | null;
  inizioConduzione: string | null;
  fineConduzione: string | null;
}

export function normalizeNullableNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' ? value : null;
}

export function normalizeNullableString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeFieldName(value: string | null | undefined): string {
  if (typeof value !== 'string') return 'Unnamed field';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'Unnamed field';
}

/** Normalizes a raw extracted field to FieldBulkPreview shape. */
export function normalizeExtractedField(
  field: ExtractedFieldRaw,
  companyId: string,
): FieldBulkPreview {
  return {
    companyId,
    name: normalizeFieldName(field.name),
    coordinates: Array.isArray(field.coordinates) ? field.coordinates : [],
    coordinatesGaussBoaga: Array.isArray(field.coordinatesGaussBoaga)
      ? field.coordinatesGaussBoaga
      : [],
    latitude: normalizeNullableNumber(field.latitude),
    longitude: normalizeNullableNumber(field.longitude),
    polygon: field.polygon ?? null,
    polygonGaussBoaga: field.polygonGaussBoaga ?? null,
    gisHa: normalizeAreaHa(field.gisHa),
    sauHa: normalizeAreaHa(field.sauHa),
    ph: normalizeNullableNumber(field.ph),
    nitrogen: normalizeNullableNumber(field.nitrogen),
    phosphorus: normalizeNullableNumber(field.phosphorus),
    potassium: normalizeNullableNumber(field.potassium),
    calcium: normalizeNullableNumber(field.calcium),
    magnesium: normalizeNullableNumber(field.magnesium),
    soilType: normalizeNullableString(field.soilType),
    uso: normalizeNullableString(field.uso),
    qualita: normalizeNullableString(field.qualita),
    superficieCatastaleMq: normalizeNullableNumber(field.superficieCatastaleMq),
    sezione: normalizeNullableString(field.sezione),
    foglio: normalizeNullableString(field.foglio),
    particella: normalizeNullableString(field.particella),
    subalterno: normalizeNullableString(field.subalterno),
    nation: normalizeNullableString(field.nation),
    region: normalizeNullableString(field.region),
    city: normalizeNullableString(field.city),
    address: normalizeNullableString(field.address),
    cap: normalizeNullableString(field.cap),
    variazioneMq: normalizeNullableString(field.variazioneMq),
    inizioConduzione: normalizeNullableString(field.inizioConduzione),
    fineConduzione: normalizeNullableString(field.fineConduzione),
  };
}

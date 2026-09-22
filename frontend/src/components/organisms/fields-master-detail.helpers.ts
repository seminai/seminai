import type { Polygon } from 'geojson';
import type { PropertyItem } from '@/components/molecules/entity-property-list';
import type { EditablePropertyItem } from '@/components/molecules/editable-property-list';
import { isGeoJsonPolygon } from '@/lib/geo-utils';
import {
  toDateInputValue,
  toNullableInput,
  toNullableInputNumber,
  toNullableNumber,
  toNullableString,
} from './master-detail-utils';

export interface FieldRow {
  readonly id: string;
  readonly name: string;
  readonly city: string | null;
  readonly foglio: string | null;
  readonly particella: string | null;
  readonly gisHa: number | null;
  readonly sauHa: number | null;
  readonly ph: number | null;
  readonly nitrogen: number | null;
  readonly phosphorus: number | null;
  readonly potassium: number | null;
  readonly calcium: number | null;
  readonly magnesium: number | null;
  readonly soilType: string | null;
  readonly uso: string | null;
  readonly qualita: string | null;
  readonly superficieCatastaleMq: number | null;
  readonly sezione: string | null;
  readonly subalterno: string | null;
  readonly nation: string | null;
  readonly region: string | null;
  readonly address: string | null;
  readonly cap: string | null;
  readonly variazioneMq: string | null;
  readonly inizioConduzione: string | null;
  readonly fineConduzione: string | null;
  readonly bufferZoneNotes: string | null;
  readonly polygon: Polygon | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export function toFieldRow(raw: Record<string, unknown>, fallbackId: string): FieldRow {
  return {
    id: String(raw.id ?? fallbackId),
    name: String(raw.name ?? '-'),
    city: toNullableString(raw.city ?? raw.comune),
    foglio: toNullableString(raw.foglio),
    particella: toNullableString(raw.particella),
    gisHa: toNullableNumber(raw.gisHa),
    sauHa: toNullableNumber(raw.sauHa),
    ph: toNullableNumber(raw.ph),
    nitrogen: toNullableNumber(raw.nitrogen),
    phosphorus: toNullableNumber(raw.phosphorus),
    potassium: toNullableNumber(raw.potassium),
    calcium: toNullableNumber(raw.calcium),
    magnesium: toNullableNumber(raw.magnesium),
    soilType: toNullableString(raw.soilType),
    uso: toNullableString(raw.uso),
    qualita: toNullableString(raw.qualita),
    superficieCatastaleMq: toNullableNumber(raw.superficieCatastaleMq),
    sezione: toNullableString(raw.sezione),
    subalterno: toNullableString(raw.subalterno),
    nation: toNullableString(raw.nation),
    region: toNullableString(raw.region),
    address: toNullableString(raw.address),
    cap: toNullableString(raw.cap),
    variazioneMq: toNullableString(raw.variazioneMq),
    inizioConduzione: toDateInputValue(raw.inizioConduzione),
    fineConduzione: toDateInputValue(raw.fineConduzione),
    bufferZoneNotes: toNullableString(raw.bufferZoneNotes),
    polygon: isGeoJsonPolygon(raw.polygon) ? raw.polygon : null,
    latitude: toNullableNumber(raw.latitude),
    longitude: toNullableNumber(raw.longitude),
  };
}

export function getFieldProperties(selected: FieldRow): PropertyItem[] {
  return [
    { label: 'Nome', value: selected.name },
    { label: 'Comune', value: selected.city },
    { label: 'Foglio', value: selected.foglio },
    { label: 'Particella', value: selected.particella },
    { label: 'GIS (ha)', value: selected.gisHa },
    { label: 'SAU (ha)', value: selected.sauHa },
    { label: 'pH', value: selected.ph },
    { label: 'Azoto', value: selected.nitrogen },
    { label: 'Fosforo', value: selected.phosphorus },
    { label: 'Potassio', value: selected.potassium },
    { label: 'Calcio', value: selected.calcium },
    { label: 'Magnesio', value: selected.magnesium },
    { label: 'Tipo suolo', value: selected.soilType },
    { label: 'Uso', value: selected.uso },
    { label: 'Qualità', value: selected.qualita },
    { label: 'Superficie catastale (mq)', value: selected.superficieCatastaleMq },
    { label: 'Sezione', value: selected.sezione },
    { label: 'Subalterno', value: selected.subalterno },
    { label: 'Nazione', value: selected.nation },
    { label: 'Provincia/Regione', value: selected.region },
    { label: 'Indirizzo', value: selected.address },
    { label: 'CAP', value: selected.cap },
    { label: 'Variazione (mq)', value: selected.variazioneMq },
    { label: 'Inizio conduzione', value: selected.inizioConduzione },
    { label: 'Fine conduzione', value: selected.fineConduzione },
    { label: 'Note fasce di rispetto', value: selected.bufferZoneNotes },
    { label: 'Latitudine', value: selected.latitude },
    { label: 'Longitudine', value: selected.longitude },
  ];
}

export function getEditableFieldProperties(selected: FieldRow): EditablePropertyItem[] {
  return getFieldProperties(selected).map((property) => {
    const key = FIELD_LABEL_KEYS[property.label];
    return {
      ...property,
      key,
      type: FIELD_INPUT_TYPES[key],
    };
  });
}

export function getFieldUpdateData(data: Record<string, string>): Record<string, unknown> {
  return {
    name: data.name ?? '',
    city: toNullableInput(data.city),
    foglio: toNullableInput(data.foglio),
    particella: toNullableInput(data.particella),
    gisHa: toNullableInputNumber(data.gisHa),
    sauHa: toNullableInputNumber(data.sauHa),
    ph: toNullableInputNumber(data.ph),
    nitrogen: toNullableInputNumber(data.nitrogen),
    phosphorus: toNullableInputNumber(data.phosphorus),
    potassium: toNullableInputNumber(data.potassium),
    calcium: toNullableInputNumber(data.calcium),
    magnesium: toNullableInputNumber(data.magnesium),
    soilType: toNullableInput(data.soilType),
    uso: toNullableInput(data.uso),
    qualita: toNullableInput(data.qualita),
    superficieCatastaleMq: toNullableInputNumber(data.superficieCatastaleMq),
    sezione: toNullableInput(data.sezione),
    subalterno: toNullableInput(data.subalterno),
    nation: toNullableInput(data.nation),
    region: toNullableInput(data.region),
    address: toNullableInput(data.address),
    cap: toNullableInput(data.cap),
    variazioneMq: toNullableInput(data.variazioneMq),
    inizioConduzione: toNullableInput(data.inizioConduzione),
    fineConduzione: toNullableInput(data.fineConduzione),
    bufferZoneNotes: toNullableInput(data.bufferZoneNotes),
    latitude: toNullableInputNumber(data.latitude),
    longitude: toNullableInputNumber(data.longitude),
  };
}

const FIELD_LABEL_KEYS: Record<string, string> = {
  Nome: 'name',
  Comune: 'city',
  Foglio: 'foglio',
  Particella: 'particella',
  'GIS (ha)': 'gisHa',
  'SAU (ha)': 'sauHa',
  pH: 'ph',
  Azoto: 'nitrogen',
  Fosforo: 'phosphorus',
  Potassio: 'potassium',
  Calcio: 'calcium',
  Magnesio: 'magnesium',
  'Tipo suolo': 'soilType',
  Uso: 'uso',
  Qualità: 'qualita',
  'Superficie catastale (mq)': 'superficieCatastaleMq',
  Sezione: 'sezione',
  Subalterno: 'subalterno',
  Nazione: 'nation',
  'Provincia/Regione': 'region',
  Indirizzo: 'address',
  CAP: 'cap',
  'Variazione (mq)': 'variazioneMq',
  'Inizio conduzione': 'inizioConduzione',
  'Fine conduzione': 'fineConduzione',
  'Note fasce di rispetto': 'bufferZoneNotes',
  Latitudine: 'latitude',
  Longitudine: 'longitude',
};

const FIELD_INPUT_TYPES: Record<string, EditablePropertyItem['type']> = {
  gisHa: 'number',
  sauHa: 'number',
  ph: 'number',
  nitrogen: 'number',
  phosphorus: 'number',
  potassium: 'number',
  calcium: 'number',
  magnesium: 'number',
  superficieCatastaleMq: 'number',
  inizioConduzione: 'date',
  fineConduzione: 'date',
  bufferZoneNotes: 'textarea',
  latitude: 'number',
  longitude: 'number',
};

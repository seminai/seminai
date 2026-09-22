import { z } from 'zod';
import type { Polygon } from 'geojson';
import type {
  PostFieldsBulkBodyFieldsItem,
  PostFieldsBulkBodyFieldsItemPolygon,
} from '@/generated/schemas';
import { centroidToCoordinates, isGeoJsonPolygon, polygonCentroid } from '@/lib/geo-utils';

export const fieldRowSchema = z.object({
  name: z.string().min(1, 'Nome richiesto'),
  address: z.string().min(1, 'Indirizzo richiesto'),
  sezione: z.string().min(1, 'Sezione richiesta'),
  foglio: z.string().min(1, 'Foglio richiesto'),
  particella: z.string().min(1, 'Particella richiesta'),
  superficieCatastaleMq: z
    .number({ error: 'Superficie richiesta' })
    .positive('Superficie deve essere > 0'),
  inizioConduzione: z.string().optional(),
  fineConduzione: z.string().optional(),
  polygon: z.custom<Polygon>(isGeoJsonPolygon).nullable().optional(),
  gisHa: z.number().positive().nullable().optional(),
});

export const fieldsBulkSchema = z.object({
  fields: z.array(fieldRowSchema).min(1, 'Aggiungi almeno un campo'),
});

export type FieldsBulkValues = z.infer<typeof fieldsBulkSchema>;
export type FieldRowValues = z.infer<typeof fieldRowSchema>;

export const EMPTY_FIELD_ROW: FieldRowValues = {
  name: '',
  address: '',
  sezione: '',
  foglio: '',
  particella: '',
  superficieCatastaleMq: 0,
  inizioConduzione: '',
  fineConduzione: '',
  polygon: null,
  gisHa: null,
};

/** Maps a form row to the POST /fields/bulk item, dropping empty optionals. */
export function toBulkFieldPayload(
  row: FieldRowValues,
  companyId: string,
): PostFieldsBulkBodyFieldsItem {
  const polygon = row.polygon ?? null;
  const centroid = polygon ? polygonCentroid(polygon) : null;
  return {
    companyId,
    name: row.name,
    address: row.address,
    sezione: row.sezione,
    foglio: row.foglio,
    particella: row.particella,
    superficieCatastaleMq: row.superficieCatastaleMq,
    ...(polygon ? { polygon: polygon as unknown as PostFieldsBulkBodyFieldsItemPolygon } : {}),
    ...(centroid
      ? {
          latitude: centroid.latitude,
          longitude: centroid.longitude,
          coordinates: centroidToCoordinates(centroid),
        }
      : {}),
    ...(row.gisHa ? { gisHa: row.gisHa } : {}),
    ...(row.inizioConduzione ? { inizioConduzione: row.inizioConduzione } : {}),
    ...(row.fineConduzione ? { fineConduzione: row.fineConduzione } : {}),
  };
}

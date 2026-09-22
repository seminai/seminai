import { type BulkImportDTO } from '../../../domain/dtos/field-production-unit-bulk-import.dto';
import { resolveFieldConductionDates } from '../../utils/field-conduction-dates';
import { resolveFieldSauHa } from '../../utils/resolve-field-sau-ha';
import type { ExtractionConfirmerContext } from './extraction-confirmer.context';

export function extractionConfirmerMapFieldPreviews(this: ExtractionConfirmerContext, fields: readonly Record<string, unknown>[]): BulkImportDTO['fields'] {
    return fields.map((f) => {
      const superficieCatastaleMq = f.superficieCatastaleMq as number | undefined;
      const gisHa = f.gisHa as number | undefined;
      const { inizioConduzione, fineConduzione } = resolveFieldConductionDates(
        f.inizioConduzione as string | undefined,
        f.fineConduzione as string | undefined,
      );
      return {
        name: (f.name as string) ?? 'Unnamed field',
        coordinates: (f.coordinates as number[]) ?? [],
        latitude: f.latitude as number | undefined,
        longitude: f.longitude as number | undefined,
        polygon: f.polygon,
        gisHa,
        sauHa:
          resolveFieldSauHa(f.sauHa as number | undefined, gisHa, superficieCatastaleMq) ??
          undefined,
        soilType: f.soilType as string | undefined,
        uso: f.uso as string | undefined,
        qualita: f.qualita as string | undefined,
        superficieCatastaleMq,
        sezione: f.sezione as string | undefined,
        foglio: f.foglio as string | undefined,
        particella: f.particella as string | undefined,
        subalterno: f.subalterno as string | undefined,
        nation: f.nation as string | undefined,
        region: f.region as string | undefined,
        city: f.city as string | undefined,
        address: f.address as string | undefined,
        cap: f.cap as string | undefined,
        variazioneMq: f.variazioneMq as string | undefined,
        inizioConduzione,
        fineConduzione,
      };
    });
  }

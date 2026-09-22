import { type BulkImportDTO } from '../../../domain/dtos/field-production-unit-bulk-import.dto';
import { normalizeAreaHa } from '../../utils/area-normalization';
import { resolvePuDateOrDefault } from '../../utils/production-unit-date-defaults';
import type { ExtractionConfirmerContext } from './extraction-confirmer.context';

export function extractionConfirmerMapPuPreviews(this: ExtractionConfirmerContext, units: readonly Record<string, unknown>[]): BulkImportDTO['productionUnits'] {
    return units.map((u) => {
      const cycle = ((u.cycles as Array<Record<string, unknown>>) ?? [])[0];
      const cycles = ((u.cycles as Array<Record<string, unknown>>) ?? []).map((entry, index) => ({
        cycleIndex: this.resolveCycleIndex(entry.cycleIndex, index),
        cropName: ((entry.cropName as string) || (u.cropName as string) || 'N/A') as string,
        cropType: ((entry.cropType as string) || (u.cropType as string) || 'N/A') as string,
        variety: ((entry.variety as string) || (u.variety as string) || 'N/A') as string,
        protocoll: ((entry.protocoll as string) ||
          (entry.cropCode as string) ||
          (u.protocoll as string) ||
          'N/A') as string,
        protectionStructure: ((entry.protectionStructure as string) ||
          (u.protectionStructure as string) ||
          'N/A') as string,
        floweringDate: this.resolveOptionalPuDate(entry.floweringDate),
        harvestingDate: this.resolveOptionalPuDate(entry.harvestingDate),
        occupazione:
          (entry.occupazione as string | undefined) ?? (u.occupazione as string | undefined),
        destinazioneDiUso:
          (entry.destinazioneDiUso as string | undefined) ??
          (entry.destinazione as string | undefined) ??
          (u.destinazioneDiUso as string | undefined),
        acquaTotalePeridoL: (entry.acquaTotalePeridoL as number | undefined) ?? 0,
        seasonYear: this.resolveSeasonYear(entry.startDate ?? u.startDate),
      }));
      const allocations = (u.allocations ?? u.fieldAllocations) as
        | Array<Record<string, unknown>>
        | undefined;
      const mappedAllocations = (allocations ?? []).map((a) => ({
        fieldId: a.fieldId as string | undefined,
        fieldName: (a.fieldName as string) || 'N/A',
        comune: a.comune as string | undefined,
        codiceNazionale: a.codiceNazionale as string | undefined,
        sezione: a.sezione as string | undefined,
        foglio: a.foglio as string | undefined,
        particella: a.particella as string | undefined,
        subalterno: a.subalterno as string | undefined,
        areaHa: normalizeAreaHa(a.areaHa) ?? 0,
      }));
      return {
        name: (u.name as string) || 'Unnamed PU',
        cropName: (u.cropName as string) || 'N/A',
        cropType: (u.cropType as string) || 'N/A',
        variety: (u.variety as string) || 'N/A',
        protocoll: (u.protocoll as string) || 'N/A',
        protectionStructure: (u.protectionStructure as string) || 'N/A',
        startDate: resolvePuDateOrDefault(cycle?.startDate ?? u.startDate, 'start'),
        floweringDate: resolvePuDateOrDefault(cycle?.floweringDate ?? u.startDate, 'start'),
        harvestingDate: resolvePuDateOrDefault(cycle?.harvestingDate ?? u.endDate, 'end'),
        endDate: resolvePuDateOrDefault(cycle?.endDate ?? u.endDate, 'end'),
        fieldAllocations:
          mappedAllocations.length > 0
            ? mappedAllocations
            : [{ fieldName: (u.name as string) || 'N/A', areaHa: normalizeAreaHa(u.areaHa) ?? 0 }],
        cycles: cycles.length > 0 ? cycles : undefined,
      };
    });
  }

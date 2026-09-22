import { getDisciplinariFromBDF, type DisciplinariEntry } from '../../tool/getDisciplinariFromBDF';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { Entry as GeocoderEntry } from 'node-geocoder';
import { DoseLimit, DoseSearchContext, NormalizedUnit, buildProductKey, disciplinariCache, entryToRecord, extractProvinceCode, geocodeCache, geocoder, normalizeRegionName, normalizeString, parseDoseValue } from './flowMatchDosageDisciplinari.part-01-usage-logger';
import { isDisciplinareEnabled, llmMatchAddressToRegion, prioritizeRecordsByDisease } from './flowMatchDosageDisciplinari.part-02-extract-diseases-from-label';

export async function selectDoseLimit(
  entries: readonly DisciplinariEntry[],
  normalizedRegion?: string,
  addressForLLM?: string,
  historyManager?: JobHistoryManager,
  unitId?: string,
  productKey?: string,
  historyMetadata?: Parameters<JobHistoryManager['addEntry']>[6],
  context?: DoseSearchContext,
): Promise<DoseLimit | undefined> {
  if (entries.length === 0) {
    return undefined;
  }
  const prioritizedRecords: Record<string, string>[] = [];
  const generalRecords: Record<string, string>[] = [];
  const llmMatchedRecords: Record<string, string>[] = [];
  let skippedNonDisciplined = 0;
  for (const entry of entries) {
    const record = entryToRecord(entry);
    if (!isDisciplinareEnabled(record)) {
      skippedNonDisciplined += 1;
      continue;
    }
    const entryRegion = normalizeRegionName(record.DECO_REGIONE);
    const entryRegionLabel = record.DECO_REGIONE;
    if (normalizedRegion && entryRegion === normalizedRegion) {
      prioritizedRecords.push(record);
    } else if (!entryRegion || entryRegion === 'nazionale') {
      generalRecords.push(record);
    } else if (
      addressForLLM &&
      entryRegionLabel &&
      normalizedRegion &&
      entryRegion !== normalizedRegion
    ) {
      const llmResult = await llmMatchAddressToRegion(addressForLLM, entryRegionLabel);
      if (llmResult.isMatch && llmResult.confidence >= 70) {
        llmMatchedRecords.push(record);
        if (historyManager && unitId && productKey) {
          const metadata = historyMetadata
            ? {
                ...historyMetadata,
                description: `Indirizzo: ${addressForLLM}. ${llmResult.reason}`,
              }
            : { description: `Indirizzo: ${addressForLLM}. ${llmResult.reason}` };
          historyManager.addEntry(
            unitId,
            productKey,
            'Match regione disciplinare via LLM',
            `${entryRegionLabel} (confidence: ${llmResult.confidence}%)`,
            DosageAgentStep.DISCIPLINARI_VALIDATION,
            DataSource.LLM_OPENAI,
            metadata,
          );
        }
      }
    }
  }
  const recordsByRegion =
    prioritizedRecords.length > 0
      ? prioritizedRecords
      : llmMatchedRecords.length > 0
        ? llmMatchedRecords
        : generalRecords;
  if (recordsByRegion.length === 0) {
    if (skippedNonDisciplined > 0 && historyManager && unitId && productKey) {
      historyManager.addEntry(
        unitId,
        productKey,
        'Prodotto non soggetto a disciplinari regionali',
        'SA_DISCIPLINARE=false',
        DosageAgentStep.DISCIPLINARI_VALIDATION,
        DataSource.BDF_DATABASE,
        historyMetadata,
      );
    }
    return undefined;
  }
  const records = prioritizeRecordsByDisease(recordsByRegion, context?.diseases ?? []);
  const maxCandidates: number[] = [];
  const minCandidates: number[] = [];
  let unit: string | undefined;
  let productName = '';
  let regNumber = '';
  let regionLabel: string | undefined;
  for (const record of records) {
    const recordMaxValues = [record.DOSE_MAX, record.DOSE_MAX_2, record.DOSE];
    const recordMinValues = [record.DOSE_MIN, record.DOSE_MIN_2];
    recordMaxValues.forEach((value) => {
      const parsed = parseDoseValue(value);
      if (typeof parsed === 'number') {
        maxCandidates.push(parsed);
      }
    });
    recordMinValues.forEach((value) => {
      const parsed = parseDoseValue(value);
      if (typeof parsed === 'number') {
        minCandidates.push(parsed);
      }
    });
    if (!unit) {
      unit = normalizeString(record.DECODIFICA) ?? normalizeString(record.DECODIFICA_2);
    }
    if (!productName && record.NOME_COMMERCIALE) {
      productName = record.NOME_COMMERCIALE;
    }
    if (!regNumber && record.NUM_REG) {
      regNumber = record.NUM_REG;
    }
    if (!regionLabel && record.DECO_REGIONE) {
      regionLabel = record.DECO_REGIONE;
    }
  }
  if (maxCandidates.length === 0 && minCandidates.length === 0) {
    return undefined;
  }
  const maxDose = maxCandidates.length > 0 ? Math.min(...maxCandidates) : undefined;
  const minDose = minCandidates.length > 0 ? Math.max(...minCandidates) : undefined;
  return {
    productName,
    regNumber,
    maxDose,
    minDose,
    unitOfMeasure: unit,
    regionLabel,
  };
}

export async function fetchDisciplinariEntries(
  productName: string,
  regNumber: string,
): Promise<readonly DisciplinariEntry[]> {
  const cacheKey = buildProductKey(productName, regNumber);
  if (disciplinariCache.has(cacheKey)) {
    return disciplinariCache.get(cacheKey) ?? [];
  }
  const entries = await getDisciplinariFromBDF({
    productName,
    registrationNumber: regNumber,
  });
  disciplinariCache.set(cacheKey, entries);
  return entries;
}

export function extractUnitId(unit: NormalizedUnit): string | undefined {
  const idCandidate =
    normalizeString((unit as { id?: string }).id) ??
    normalizeString((unit as { idApp?: string }).idApp);
  if (!idCandidate) {
    return undefined;
  }
  return idCandidate;
}

export function extractFromSnapshot(
  unit: NormalizedUnit | undefined,
  fieldName: string,
): string | undefined {
  if (!unit) return undefined;
  const value = (unit as Record<string, unknown>)[fieldName];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

export function extractProvinceFromSnapshot(unit: NormalizedUnit | undefined): string | undefined {
  return (
    extractFromSnapshot(unit, 'province') ??
    extractFromSnapshot(unit, 'provincia') ??
    extractProvinceCode(extractFromSnapshot(unit, 'city'))
  );
}

export function buildAddressString(parts: ReadonlyArray<string | undefined> = []): string | undefined {
  const filtered = parts.filter(
    (part) => typeof part === 'string' && part.trim().length > 0,
  ) as string[];
  if (filtered.length === 0) {
    return undefined;
  }
  return filtered.join(', ');
}

export async function geocodeRegion(address: string): Promise<string | undefined> {
  const cacheKey = address.toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    const cached = geocodeCache.get(cacheKey);
    return cached ?? undefined;
  }
  try {
    const results: GeocoderEntry[] = await geocoder.geocode(address);
    const region =
      results[0]?.administrativeLevels?.level1long ??
      results[0]?.state ??
      results[0]?.county ??
      null;
    geocodeCache.set(cacheKey, region);
    return region ?? undefined;
  } catch (error) {
    console.warn(
      `[DISCIPLINARI] Geocoding failed for address "${address}":`,
      error instanceof Error ? error.message : String(error),
    );
    geocodeCache.set(cacheKey, null);
    return undefined;
  }
}

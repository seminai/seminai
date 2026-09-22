/**
 * Conversion logic from Piano Colturale LLM-extracted data
 * to ExtractedFieldData and ProductionUnitExtractionResult formats.
 */

import {
  parseEmiliaRomagnaDate,
  isNonAgriculturalUse,
  parseUsoSuoloFromOccupazione,
} from './template/emilia_romagna_file_structure';
import type { ExtractedFieldData } from './field_csv_agent';
import type {
  ProductionUnitRaw,
  ProductionCycleRaw,
  ProductionUnitExtractionResult,
} from '../production_unit/production_unit_csv_agent';
import type { ExtractionDiagnostics } from './utils/csv_parser';
import type { PianoColturaleData } from './piano_colturale_pdf_agent';

export function convertToFieldData(data: PianoColturaleData): ExtractedFieldData {
  const fields = data.particelle.map((p) => {
    const normalizedParticella = p.particella.replace(/^0+/, '') || p.particella;

    const sauHa =
      p.superficieSauHa ??
      p.colture
        .filter((c) => !isNonAgriculturalUse(c.nome))
        .reduce((sum, c) => sum + c.superficieHa, 0);

    const totalHa = p.superficieTotaleHa ?? p.colture.reduce((sum, c) => sum + c.superficieHa, 0);
    const superficieCatastaleMq = totalHa > 0 ? Math.round(totalHa * 10000) : null;

    const uso =
      p.colture
        .map((c) => parseUsoSuoloFromOccupazione(c.nome))
        .filter((u): u is string => u !== null)
        .join(', ') || null;

    const firstCrop = p.colture[0];
    const inizioConduzione = firstCrop?.dataInizio
      ? parseEmiliaRomagnaDate(firstCrop.dataInizio)
      : null;
    const fineConduzione = firstCrop?.dataFine ? parseEmiliaRomagnaDate(firstCrop.dataFine) : null;

    const cityName = p.comune || data.azienda.comune || 'Unknown';
    const name = `${cityName} - F${p.foglio} P${normalizedParticella}`;

    return {
      name,
      nation: 'IT' as const,
      region: 'EMILIA ROMAGNA',
      city: cityName,
      address: data.azienda.indirizzo || null,
      cap: data.azienda.cap || null,
      foglio: p.foglio,
      particella: normalizedParticella,
      subalterno: p.subalterno,
      sezione: p.sezione,
      superficieCatastaleMq,
      gisHa: null,
      sauHa: Math.round(sauHa * 10000) / 10000,
      variazioneMq: null,
      uso,
      qualita: null,
      soilType: null,
      ph: null,
      nitrogen: null,
      phosphorus: null,
      potassium: null,
      calcium: null,
      magnesium: null,
      latitude: null,
      longitude: null,
      inizioConduzione,
      fineConduzione,
    };
  });

  const diagnostics: ExtractionDiagnostics = {
    totalRows: data.particelle.reduce((sum, p) => sum + p.colture.length, 0),
    extractedRows: fields.length,
    detectedFormat: 'AGREA_PIANO_COLTURALE_PDF',
    skippedRows: [],
    warnings: [],
  };

  return { fields, diagnostics };
}

export function convertToProductionUnitData(
  data: PianoColturaleData,
): ProductionUnitExtractionResult {
  const aggregated = new Map<string, ProductionUnitRaw>();

  for (const p of data.particelle) {
    const normalizedParticella = p.particella.replace(/^0+/, '') || p.particella;
    const cityName = p.comune || data.azienda.comune || 'Unknown';

    for (const coltura of p.colture) {
      if (isNonAgriculturalUse(coltura.nome)) continue;

      const cropName = parseUsoSuoloFromOccupazione(coltura.nome) || coltura.nome;
      const variety =
        coltura.varieta && !coltura.varieta.toUpperCase().includes('NESSUNA VARIETA')
          ? coltura.varieta
          : null;

      const startDate = coltura.dataInizio ? parseEmiliaRomagnaDate(coltura.dataInizio) : null;
      const endDate = coltura.dataFine ? parseEmiliaRomagnaDate(coltura.dataFine) : null;

      const normCrop = cropName.toUpperCase().trim();
      const normVariety = (variety || '').toUpperCase().trim();
      const key = `${normCrop}|${normVariety}|${cityName.toUpperCase()}|${startDate || ''}|${endDate || ''}`;
      const fieldName = `${cityName} - F${p.foglio} P${normalizedParticella}`;

      if (!aggregated.has(key)) {
        const unitName = variety
          ? `${cropName} - ${variety} (${cityName})`
          : `${cropName} (${cityName})`;

        const cycle: ProductionCycleRaw = {
          cycleIndex: 0,
          cropName,
          cropType: cropName,
          cropCode: coltura.codice,
          variety,
          occupazione: coltura.nome,
          destinazione: null,
          protectionStructure: null,
          startDate,
          endDate,
          floweringDate: null,
          harvestingDate: null,
        };

        aggregated.set(key, {
          name: unitName,
          sezione: p.sezione,
          foglio: p.foglio,
          particella: normalizedParticella,
          subalterno: p.subalterno,
          areaHa: coltura.superficieHa,
          protocoll: coltura.criterioMantenimento || null,
          startDate,
          endDate,
          cycles: [cycle],
          allocations: [
            {
              fieldName,
              sezione: p.sezione,
              foglio: p.foglio,
              particella: normalizedParticella,
              subalterno: p.subalterno,
              areaHa: coltura.superficieHa,
            },
          ],
        });
      } else {
        const existing = aggregated.get(key)!;
        existing.areaHa = (existing.areaHa ?? 0) + coltura.superficieHa;

        const existingAllocation = existing.allocations.find(
          (a) =>
            a.foglio === p.foglio &&
            a.particella === normalizedParticella &&
            a.sezione === p.sezione,
        );

        if (existingAllocation) {
          existingAllocation.areaHa += coltura.superficieHa;
        } else {
          existing.allocations.push({
            fieldName,
            sezione: p.sezione,
            foglio: p.foglio,
            particella: normalizedParticella,
            subalterno: p.subalterno,
            areaHa: coltura.superficieHa,
          });
        }

        if (startDate && (!existing.startDate || startDate < existing.startDate)) {
          existing.startDate = startDate;
        }
        if (endDate && (!existing.endDate || endDate > existing.endDate)) {
          existing.endDate = endDate;
        }
      }
    }
  }

  const units = Array.from(aggregated.values()).map((u) => ({
    ...u,
    areaHa: u.areaHa !== null ? Math.round(u.areaHa * 10000) / 10000 : null,
    allocations: u.allocations.map((a) => ({
      ...a,
      areaHa: Math.round(a.areaHa * 10000) / 10000,
    })),
  }));

  const totalCropRows = data.particelle.reduce(
    (sum, p) => sum + p.colture.filter((c) => !isNonAgriculturalUse(c.nome)).length,
    0,
  );

  const diagnostics: ExtractionDiagnostics = {
    totalRows: totalCropRows,
    extractedRows: units.length,
    detectedFormat: 'AGREA_PIANO_COLTURALE_PDF',
    skippedRows: [],
    warnings: [],
  };

  return { units, diagnostics };
}

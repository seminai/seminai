import { type ParsedRow } from '../file_agent/utils/csv_parser';
import { EMILIA_ROMAGNA_COLUMN_MAPPING, parseUsoSuoloFromOccupazione as parseEmiliaRomagnaUsoSuolo, parseEmiliaRomagnaDate, parseEmiliaRomagnaSuperficie, isNonAgriculturalUse as isEmiliaRomagnaNonAgricultural, isSauRow as isEmiliaRomagnaSauRow } from '../file_agent/template/emilia_romagna_file_structure';
import { CropIdentificationInput, ProductionCycleRaw, ProductionUnitRaw } from './production_unit_csv_agent.support';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export async function productionUnitCsvAgentExtractEmiliaRomagnaFormat(this: ProductionUnitCsvAgentContext, rows: ParsedRow[]): Promise<ProductionUnitRaw[]> {
    const cols = EMILIA_ROMAGNA_COLUMN_MAPPING;
    const aggregated = new Map<string, ProductionUnitRaw>();

    // Collect unique crops for LLM identification
    const cropInputsMap = new Map<string, CropIdentificationInput>();

    for (const row of rows) {
      const occupazioneSuolo = row[cols.occupazioneSuolo];

      // Skip rows without occupation or non-agricultural uses
      // FLAG SAU = 'N' is the authoritative AGEA indicator (covers BOSCO, USO FORESTALE, etc.)
      const flagSauValue = row[cols.flagSau]?.trim() ?? '';
      const isNonAgricultural =
        (flagSauValue !== '' && !isEmiliaRomagnaSauRow(flagSauValue)) ||
        isEmiliaRomagnaNonAgricultural(occupazioneSuolo);
      if (!occupazioneSuolo || isNonAgricultural) {
        continue;
      }

      // Parse crop info
      const cropName = parseEmiliaRomagnaUsoSuolo(occupazioneSuolo);
      if (!cropName) {
        continue;
      }

      // Get area (already in HA)
      const superficieRaw = row[cols.superficieHa];
      const areaHa = parseEmiliaRomagnaSuperficie(superficieRaw);
      if (areaHa === null || areaHa <= 0) {
        continue;
      }

      // Get variety
      const varieta = row[cols.varieta]?.trim() || null;

      // Get crop code
      const cropCode = row[cols.codColtura]?.trim() || null;

      // Get dates (DD-MM-YYYY format)
      const dataInizio = parseEmiliaRomagnaDate(row[cols.dataInizioUtilizzo] || '');
      const dataFine = parseEmiliaRomagnaDate(row[cols.dataFineUtilizzo] || '');

      const startDate = dataInizio;
      const endDate = dataFine;

      // Get cadastral info - NOTA: "FOGLIO " has trailing space
      let foglio = row[cols.foglio]?.trim() || null;
      if (!foglio) {
        foglio = row['FOGLIO']?.trim() || null;
      }
      const particella = row[cols.particella]?.trim() || null;
      const subalterno = row[cols.subalterno]?.trim() || null;

      // Get comune
      const comune = row[cols.comune]?.trim() || '';

      // Build aggregation key: Crop + Variety + Comune + Dates
      const cropNorm = this.normalizeString(cropName);
      const varietyNorm = varieta ? this.normalizeString(varieta) : '';
      const comuneNorm = this.normalizeString(comune);
      const key = `${cropNorm}|${varietyNorm}|${comuneNorm}|${startDate || 'no_start'}|${endDate || 'no_end'}`;

      // Collect crop for LLM identification
      const cropCacheKey = this.buildCropCacheKey(cropName, varieta);
      if (!cropInputsMap.has(cropCacheKey) && !this.cropCache.has(cropCacheKey)) {
        cropInputsMap.set(cropCacheKey, { cropName, variety: varieta });
      }

      // Get destinazione and uso
      const destinazione = row[cols.destinazione]?.trim() || null;
      const uso = row[cols.uso]?.trim() || null;

      // Get or create aggregated unit
      let unit = aggregated.get(key);
      if (!unit) {
        // Build unit name from crop + variety + comune
        const comuneLabel = comune ? ` (${comune})` : '';
        const unitDisplayName = varieta
          ? `${cropName} - ${varieta}${comuneLabel}`
          : `${cropName}${comuneLabel}`;

        // Create primary cycle
        const primaryCycle: ProductionCycleRaw = {
          cycleIndex: 0,
          cropName,
          cropType: cropName,
          cropCode,
          variety: varieta,
          occupazione: occupazioneSuolo,
          destinazione: destinazione || uso,
          protectionStructure: null,
          startDate,
          endDate,
          floweringDate: null,
          harvestingDate: null,
        };

        unit = {
          name: unitDisplayName,
          sezione: null, // Emilia-Romagna format doesn't have sezione
          foglio,
          particella,
          subalterno,
          areaHa: 0,
          protocoll: 'EMILIA_ROMAGNA',
          startDate,
          endDate,
          cycles: [primaryCycle],
          allocations: [],
        };
        aggregated.set(key, unit);
      }

      // Build field name from comune + cadastral info
      const fieldName = `${comune} - F${foglio || '?'} P${particella || '?'}`;

      // Find or create allocation for this field
      let allocation = unit.allocations.find(
        (a) => a.foglio === foglio && a.particella === particella,
      );
      if (!allocation) {
        allocation = {
          fieldName,
          sezione: null,
          foglio,
          particella,
          subalterno,
          areaHa: 0,
        };
        unit.allocations.push(allocation);
      }

      // Sum area
      allocation.areaHa += areaHa;
      unit.areaHa = (unit.areaHa || 0) + areaHa;

      // Set cadastral info from first allocation if not set
      if (!unit.foglio && foglio) unit.foglio = foglio;
      if (!unit.particella && particella) unit.particella = particella;
      if (!unit.subalterno && subalterno) unit.subalterno = subalterno;

      // Extend date range
      if (startDate && (!unit.startDate || startDate < unit.startDate)) {
        unit.startDate = startDate;
      }
      if (endDate && (!unit.endDate || endDate > unit.endDate)) {
        unit.endDate = endDate;
      }
    }

    const cropInputs = Array.from(cropInputsMap.values());
    if (cropInputs.length > 0) {
      await this.identifyCropsWithLLM(cropInputs);
      await this.finalizeCropIdentification(aggregated);
    }

    // Round areas to 4 decimal places
    for (const unit of aggregated.values()) {
      unit.areaHa = Math.round((unit.areaHa || 0) * 10000) / 10000;
      for (const alloc of unit.allocations) {
        alloc.areaHa = Math.round(alloc.areaHa * 10000) / 10000;
      }
    }

    const result = Array.from(aggregated.values());
    console.log(
      `ProductionUnitCsvAgent: Emilia-Romagna format - Extracted ${result.length} production units`,
    );

    return result;
  }

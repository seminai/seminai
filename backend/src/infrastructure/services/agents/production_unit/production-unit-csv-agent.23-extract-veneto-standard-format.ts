import { type ParsedRow } from '../file_agent/utils/csv_parser';
import { VENETO_COLUMN_MAPPING, parseUsoSuoloFromOccupazione as parseVenetoUsoSuolo, parseVenetoDate, parseVenetoSuperficie, isNonAgriculturalUse as isVenetoNonAgricultural, parseComuneDescrizione as parseVenetoComuneDescrizione } from '../file_agent/template/veneto_file_structure';
import { CropIdentificationInput, ProductionCycleRaw, ProductionUnitRaw } from './production_unit_csv_agent.support';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export async function productionUnitCsvAgentExtractVenetoStandardFormat(this: ProductionUnitCsvAgentContext, rows: ParsedRow[]): Promise<ProductionUnitRaw[]> {
    const cols = VENETO_COLUMN_MAPPING;
    const aggregated = new Map<string, ProductionUnitRaw>();

    // Collect unique crops for LLM identification
    const cropInputsMap = new Map<string, CropIdentificationInput>();

    for (const row of rows) {
      const occupazionePrimario = row[cols.occupazioneSuoloPrimario];

      // Skip rows without occupation or non-agricultural uses
      if (!occupazionePrimario || isVenetoNonAgricultural(occupazionePrimario)) {
        continue;
      }

      // Parse crop info from occupation column
      const cropName = parseVenetoUsoSuolo(occupazionePrimario);
      if (!cropName) {
        continue;
      }

      // Get area from Superficie Uso Suolo Primario (already in HA)
      const superficiePrimarioRaw = row[cols.superficiePrimario];
      const areaHa = parseVenetoSuperficie(superficiePrimarioRaw);
      if (areaHa === null || areaHa <= 0) {
        continue;
      }

      // Get variety (clean bracket format)
      const varietaRaw = row[cols.varietaPrimario];
      const varieta =
        varietaRaw && varietaRaw !== '[000] -'
          ? varietaRaw.replace(/^\[\d+\]\s*/, '').trim() || null
          : null;

      // Get dates (DD/MM/YYYY format)
      const dataInizio = parseVenetoDate(row[cols.dataInizioSeminaPrimario] || '');
      const dataFine = parseVenetoDate(row[cols.dataFineSeminaPrimario] || '');

      const startDate = dataInizio;
      const endDate = dataFine;

      // Get cadastral info
      const sezione = row[cols.sezione]?.trim() || null;
      const foglio = row[cols.foglio]?.trim() || null;
      const particella = row[cols.particella]?.trim() || null;
      const subalterno = row[cols.subalterno]?.trim() || null;

      // Get comune
      const comuneDescrizione = row[cols.comuneDescrizione] || '';
      const { comune } = parseVenetoComuneDescrizione(comuneDescrizione);

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

      // Get destinazione
      const destinazioneRaw = row[cols.destinazionePrimario];
      const destinazione =
        destinazioneRaw && destinazioneRaw !== '[000] -'
          ? destinazioneRaw.replace(/^\[\d+\]\s*/, '').trim() || null
          : null;

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
          cropCode: null,
          variety: varieta,
          occupazione: occupazionePrimario,
          destinazione,
          protectionStructure: row[cols.epocaSeminaPrimario]?.trim() || null,
          startDate,
          endDate,
          floweringDate: null,
          harvestingDate: null,
        };

        unit = {
          name: unitDisplayName,
          sezione,
          foglio,
          particella,
          subalterno,
          areaHa: 0,
          protocoll: 'VENETO',
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
        (a) =>
          a.foglio === foglio &&
          a.particella === particella &&
          (a.sezione ?? '') === (sezione ?? ''),
      );
      if (!allocation) {
        allocation = {
          fieldName,
          sezione,
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
      if (!unit.sezione && sezione) unit.sezione = sezione;
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
      `ProductionUnitCsvAgent: Veneto Standard format - Extracted ${result.length} production units`,
    );

    return result;
  }

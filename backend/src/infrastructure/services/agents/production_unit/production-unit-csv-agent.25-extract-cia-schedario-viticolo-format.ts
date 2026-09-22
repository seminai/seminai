import { type ParsedRow } from '../file_agent/utils/csv_parser';
import { CIA_SCHEDARIO_VITICOLO_COLUMN_MAPPING, parseCiaNumber, normalizeVitignoName } from '../file_agent/template/cia_schedario_viticolo_file_structure';
import { CropIdentificationInput, ProductionCycleRaw, ProductionUnitRaw } from './production_unit_csv_agent.support';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export async function productionUnitCsvAgentExtractCiaSchedarioViticoloFormat(this: ProductionUnitCsvAgentContext, rows: ParsedRow[]): Promise<ProductionUnitRaw[]> {
    const cols = CIA_SCHEDARIO_VITICOLO_COLUMN_MAPPING;
    const aggregated = new Map<string, ProductionUnitRaw>();

    // Collect unique grape varieties for LLM identification
    const cropInputsMap = new Map<string, CropIdentificationInput>();

    for (const row of rows) {
      const descrizioneVitigno = (row[cols.descrizioneVitigno] || '').trim();

      // Skip rows without grape variety
      if (!descrizioneVitigno) {
        continue;
      }

      // Parse grape variety name
      const { name: vitignoName, colorCode } = normalizeVitignoName(descrizioneVitigno);
      if (!vitignoName) {
        continue;
      }

      // Get area from SUP. VITATA DICHIARATA (in MQ)
      const supVitataMq = parseCiaNumber(row[cols.supVitataDichiarata]);
      if (supVitataMq === null || supVitataMq <= 0) {
        continue;
      }
      const areaHa = supVitataMq / 10000;

      // Build crop name: "Vite" is the crop, grape variety is the variety
      const cropName = 'Vite';
      const variety = vitignoName;

      // Get cadastral info
      const sezione = (row[cols.sezione] || '').trim() || null;
      const foglio = (row[cols.foglio] || '').trim() || null;
      const particella = (row[cols.particella] || '').trim() || null;

      // Get comune for field naming and aggregation
      const comune = (row[cols.comune] || '').trim();

      // Build aggregation key: Grape variety + Comune
      const varietyNorm = this.normalizeString(variety);
      const comuneNorm = this.normalizeString(comune);
      const key = `${varietyNorm}|${comuneNorm}`;

      // Collect crop for LLM identification (grape variety as variety of Vite)
      const cropCacheKey = this.buildCropCacheKey(cropName, variety);
      if (!cropInputsMap.has(cropCacheKey) && !this.cropCache.has(cropCacheKey)) {
        cropInputsMap.set(cropCacheKey, { cropName, variety });
      }

      // Get additional info
      const formaAllevamento = (row[cols.formaAllevamento] || '').trim() || null;
      const annoImpianto = (row[cols.annoImpianto] || '').trim() || null;

      // Get or create aggregated unit
      let unit = aggregated.get(key);
      if (!unit) {
        // Build display name
        const colorSuffix = colorCode ? ` (${colorCode})` : '';
        const comuneLabel = comune ? ` (${comune})` : '';
        const unitDisplayName = `Vite - ${variety}${colorSuffix}${comuneLabel}`;

        // Create primary cycle
        const primaryCycle: ProductionCycleRaw = {
          cycleIndex: 0,
          cropName: 'Vitis vinifera',
          cropType: 'vite',
          cropCode: null,
          variety,
          occupazione: `Vite - ${descrizioneVitigno}`,
          destinazione: formaAllevamento,
          protectionStructure: null,
          startDate: null,
          endDate: null,
          floweringDate: null,
          harvestingDate: null,
        };

        unit = {
          name: unitDisplayName,
          sezione,
          foglio,
          particella,
          subalterno: null,
          areaHa: 0,
          protocoll: 'CIA_SCHEDARIO_VITICOLO',
          startDate: annoImpianto ? `${annoImpianto}-01-01` : null,
          endDate: null,
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
          subalterno: null,
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
      `ProductionUnitCsvAgent: CIA Schedario Viticolo format - Extracted ${result.length} production units`,
    );

    return result;
  }

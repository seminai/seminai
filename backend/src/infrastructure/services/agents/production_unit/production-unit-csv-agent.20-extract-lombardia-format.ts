import { type ParsedRow } from '../file_agent/utils/csv_parser';
import { LOMBARDIA_COLUMN_MAPPING, parseCropFromTipoUtilizzo, parseLombardiaDate, isNonAgriculturalUse, parseColtivazioneCycle, getBestAreaMq } from '../file_agent/template/lombardia_file_structure';
import { CropIdentificationInput, ProductionCycleRaw, ProductionUnitRaw } from './production_unit_csv_agent.support';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export async function productionUnitCsvAgentExtractLombardiaFormat(this: ProductionUnitCsvAgentContext, rows: ParsedRow[]): Promise<ProductionUnitRaw[]> {
    const cols = LOMBARDIA_COLUMN_MAPPING;
    const aggregated = new Map<string, ProductionUnitRaw>();

    // Collect unique crops for LLM identification
    const cropInputsMap = new Map<string, CropIdentificationInput>();

    for (const row of rows) {
      const tipoUtilizzo = row[cols.tipoUtilizzo];

      // Skip rows without TIPO UTILIZZO or non-agricultural uses
      if (!tipoUtilizzo || isNonAgriculturalUse(tipoUtilizzo)) {
        continue;
      }

      // Parse crop info
      const cropInfo = parseCropFromTipoUtilizzo(tipoUtilizzo);
      if (!cropInfo.name) {
        continue;
      }

      // Get area in MQ and convert to HA
      const areaMq = getBestAreaMq(row);
      if (areaMq === null || areaMq <= 0) {
        continue;
      }
      const areaHa = areaMq / 10000;

      // Get variety
      const varieta = row[cols.varieta]?.trim() || null;

      // Get dates
      const dataSemina = parseLombardiaDate(row[cols.dataSemina] || '');
      const dataRaccolta = parseLombardiaDate(row[cols.dataRaccolta] || '');
      const dataFineContratto = parseLombardiaDate(row[cols.dataFineContratto] || '');

      // Use semina as start, raccolta or fine contratto as end
      const startDate = dataSemina;
      const endDate = dataRaccolta || dataFineContratto;

      // Get cycle type (Primaria/Secondaria)
      const cycleType = parseColtivazioneCycle(row[cols.coltivazione] || '');
      const cycleLabel = cycleType === 'secondary' ? 'secondaria' : 'primaria';

      // Get cadastral info
      const sezione = row[cols.sezioneCensuaria]?.trim() || null;
      const foglio = row[cols.foglio]?.trim() || null;
      const particella = row[cols.mappale]?.trim() || null; // MAPPALE = Particella
      const subalterno = row[cols.subalterno]?.trim() || null;
      const comune = row[cols.comune]?.trim() || '';

      // Build aggregation key: Crop + Variety + Comune + CycleType + Dates
      const cropNorm = this.normalizeString(cropInfo.name);
      const varietyNorm = varieta ? this.normalizeString(varieta) : '';
      const comuneNorm = this.normalizeString(comune);
      const key = `${cropNorm}|${varietyNorm}|${comuneNorm}|${cycleLabel}|${startDate || 'no_start'}|${endDate || 'no_end'}`;

      // Collect crop for LLM identification
      const cropCacheKey = this.buildCropCacheKey(cropInfo.name, varieta);
      if (!cropInputsMap.has(cropCacheKey) && !this.cropCache.has(cropCacheKey)) {
        cropInputsMap.set(cropCacheKey, { cropName: cropInfo.name, variety: varieta });
      }

      // Get or create aggregated unit
      let unit = aggregated.get(key);
      if (!unit) {
        // Build unit name from crop + variety + comune + cycle type
        const displayVariety = varieta;
        const comuneLabel = comune ? ` (${comune})` : '';
        const cycleDisplayLabel = cycleType === 'secondary' ? ' - Secondaria' : ' - Primaria';
        const unitDisplayName = displayVariety
          ? `${cropInfo.name} - ${displayVariety}${comuneLabel}${cycleDisplayLabel}`
          : `${cropInfo.name}${comuneLabel}${cycleDisplayLabel}`;

        // Create cycle
        const primaryCycle: ProductionCycleRaw = {
          cycleIndex: cycleType === 'secondary' ? 1 : 0,
          cropName: cropInfo.name,
          cropType: cropInfo.name,
          cropCode: cropInfo.code,
          variety: varieta,
          occupazione: tipoUtilizzo,
          destinazione: cropInfo.details,
          protectionStructure: row[cols.epocaSemina]?.trim() || null,
          startDate,
          endDate,
          floweringDate: null,
          harvestingDate: dataRaccolta,
        };

        unit = {
          name: unitDisplayName,
          sezione,
          foglio,
          particella,
          subalterno,
          areaHa: 0,
          protocoll: 'LOMBARDIA',
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

    // Resolve missing dates via LLM based on crop and cycle type
    const unitsNeedingDates: Array<{
      cropName: string;
      cycleType: 'primary' | 'secondary' | null;
      year: string;
    }> = [];
    // Determine the reference year from the first row's annoCampagna
    const referenceYear =
      rows.find((r) => r[cols.annoCampagna]?.trim())?.[cols.annoCampagna]?.trim() ||
      new Date().getFullYear().toString();

    for (const unit of aggregated.values()) {
      for (const cycle of unit.cycles) {
        if (!cycle.startDate || !cycle.endDate) {
          const ct: 'primary' | 'secondary' | null =
            cycle.cycleIndex === 1 ? 'secondary' : 'primary';
          unitsNeedingDates.push({
            cropName: cycle.cropName || unit.name,
            cycleType: ct,
            year: referenceYear,
          });
        }
      }
    }

    if (unitsNeedingDates.length > 0) {
      const cycleDatesMap = await this.resolveCycleDatesWithLLM(unitsNeedingDates);

      // Apply resolved dates to units
      for (const unit of aggregated.values()) {
        for (const cycle of unit.cycles) {
          if (!cycle.startDate || !cycle.endDate) {
            const ct = cycle.cycleIndex === 1 ? 'secondaria' : 'primaria';
            const cropKey = `${this.normalizeString(cycle.cropName || unit.name)}|${ct}`;
            const resolved = cycleDatesMap.get(cropKey);
            if (resolved) {
              if (!cycle.startDate) cycle.startDate = resolved.startDate;
              if (!cycle.endDate) cycle.endDate = resolved.endDate;
            }
          }
        }
        // Also update unit-level dates from cycle dates
        if (!unit.startDate && unit.cycles[0]?.startDate) {
          unit.startDate = unit.cycles[0].startDate;
        }
        if (!unit.endDate && unit.cycles[0]?.endDate) {
          unit.endDate = unit.cycles[0].endDate;
        }
      }
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
      `ProductionUnitCsvAgent: Lombardia format - Extracted ${result.length} production units`,
    );

    return result;
  }

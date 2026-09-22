import { type ParsedRow } from '../file_agent/utils/csv_parser';
import { ColumnMapping, ProductionCycleRaw, ProductionUnitRaw } from './production_unit_csv_agent.support';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export function productionUnitCsvAgentExtractLegacyFormat(this: ProductionUnitCsvAgentContext, rows: ParsedRow[], mapping: ColumnMapping): ProductionUnitRaw[] {
    const cols = mapping.columns;
    const aggregated = new Map<string, ProductionUnitRaw>();

    for (const row of rows) {
      // Get crop name - this is the main identifier for grouping
      // Try multiple columns: cropName, occupazioneSuoloPrimario (might contain crop in LEGACY format too)
      const cropName =
        this.getValue(row, cols.cropName) ||
        this.getValue(row, cols.occupazioneSuoloPrimario) ||
        'Coltura non specificata';

      // Get variety (optional but part of aggregation key)
      const variety = this.getValue(row, cols.variety);

      // Get field name for allocations - prefer fieldName or unitName
      const fieldName =
        this.getValue(row, cols.fieldName) || this.getValue(row, cols.unitName) || 'Campo';

      // Get area
      let areaHa: number | null = this.parseNumber(this.getValue(row, cols.areaHa));
      if (areaHa === null || areaHa <= 0) {
        areaHa = this.parseNumber(this.getValue(row, cols.superficieAgricola));
      }
      if (areaHa === null || areaHa <= 0) {
        continue;
      }
      // At this point, areaHa is guaranteed to be a positive number
      const areaHaValue: number = areaHa;

      // Get dates
      const startDate = this.parseDate(this.getValue(row, cols.startDate));
      const endDate = this.parseDate(this.getValue(row, cols.endDate));

      // Get cadastral info
      const sezione = this.getValue(row, cols.sezione);
      const foglio = this.getValue(row, cols.foglio);
      const particella = this.getValue(row, cols.particella);
      const subalterno = this.getValue(row, cols.subalterno);

      // Get comune from column mapping
      const comuneRaw = this.getValue(row, cols.comuneDescrizione) || '';

      // Build aggregation key based on CROP + VARIETY + COMUNE + DATES
      const cropNorm = this.normalizeString(cropName);
      const varietyNorm = this.normalizeString(variety || '');
      const comuneNorm = this.normalizeString(comuneRaw);
      const key = `${cropNorm}|${varietyNorm}|${comuneNorm}|${startDate || 'no_start'}|${endDate || 'no_end'}`;

      // Get crop info from LLM-identified cache
      const cropInfo = this.getCropIdentification(cropName, variety);

      // Get or create aggregated unit
      let unit = aggregated.get(key);
      if (!unit) {
        // Build unit name from crop + variety + comune (use normalized variety from LLM if available)
        const displayVariety = cropInfo.variety || variety;
        const comuneLabel = comuneRaw ? ` (${comuneRaw})` : '';
        const unitDisplayName = displayVariety
          ? `${cropName} - ${displayVariety}${comuneLabel}`
          : `${cropName}${comuneLabel}`;

        // Create primary cycle
        const primaryCycle: ProductionCycleRaw = {
          cycleIndex: 0,
          cropName: cropInfo.cropName,
          cropType: cropInfo.cropType,
          cropCode: cropInfo.code,
          variety: cropInfo.variety || variety,
          occupazione: cropName,
          destinazione: this.getValue(row, cols.cropType),
          protectionStructure: this.getValue(row, cols.protectionStructure),
          startDate,
          endDate,
          floweringDate: this.parseDate(this.getValue(row, cols.floweringDate)),
          harvestingDate: this.parseDate(this.getValue(row, cols.harvestingDate)),
        };

        unit = {
          name: unitDisplayName,
          sezione,
          foglio,
          particella,
          subalterno,
          areaHa: 0,
          protocoll: this.getValue(row, cols.protocoll),
          startDate,
          endDate,
          cycles: [primaryCycle],
          allocations: [],
        };
        aggregated.set(key, unit);
      }

      // Find or create allocation
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
      allocation.areaHa += areaHaValue;
      unit.areaHa = (unit.areaHa ?? 0) + areaHaValue;
    }

    // Round areas
    for (const unit of aggregated.values()) {
      unit.areaHa = Math.round((unit.areaHa ?? 0) * 10000) / 10000;
      for (const alloc of unit.allocations) {
        alloc.areaHa = Math.round(alloc.areaHa * 10000) / 10000;
      }
    }

    return Array.from(aggregated.values());
  }

import { type ParsedRow } from '../file_agent/utils/csv_parser';
import { ColumnMapping, ProductionCycleRaw, ProductionUnitRaw, AggregationKey } from './production_unit_csv_agent.support';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export function productionUnitCsvAgentExtractAgeaFormat(this: ProductionUnitCsvAgentContext, rows: ParsedRow[], mapping: ColumnMapping): ProductionUnitRaw[] {
    const cols = mapping.columns;
    const aggregated = new Map<string, ProductionUnitRaw>();

    for (const row of rows) {
      // Get PRIMARY occupation (crop) code and name - this is the main grouping key
      const occupazionePrimariaRaw = this.getValue(row, cols.occupazioneSuoloPrimario);
      if (!occupazionePrimariaRaw) {
        continue;
      }

      // Parse occupation like "[003] COLZA" -> code=003, name=COLZA
      const { name: occupazionePrimariaName } = this.parseOccupazione(occupazionePrimariaRaw);

      // Get PRIMARY variety (optional but part of aggregation key)
      const varietaPrimariaRaw = this.getValue(row, cols.varietaUsoSuoloPrimario);
      const varietaPrimaria = this.cleanBracketValue(varietaPrimariaRaw);

      // Get area - prefer Superficie Uso Suolo Primario or Superficie Netta
      let areaHa = this.parseNumber(this.getValue(row, cols.superficieUsoSuoloPrimario));
      if (areaHa === null || areaHa <= 0) {
        areaHa = this.parseNumber(this.getValue(row, cols.superficieNettaUsoSuoloPrimario));
      }
      if (areaHa === null || areaHa <= 0) {
        continue; // Skip rows without valid area
      }

      // Get PRIMARY dates
      const startDatePrimarioRaw = this.getValue(row, cols.dataInizioSeminaPrimario);
      const endDatePrimarioRaw = this.getValue(row, cols.dataFineSeminaPrimario);
      const startDatePrimario = this.parseDate(startDatePrimarioRaw);
      const endDatePrimario = this.parseDate(endDatePrimarioRaw);

      // Build aggregation key: Occupation + Variety + Primary Dates
      const occupazioneNorm = this.normalizeString(
        occupazionePrimariaName || occupazionePrimariaRaw,
      );
      const varietyNorm = this.normalizeString(varietaPrimaria || '');
      const keyObj: AggregationKey = {
        occupazioneNorm,
        varietyNorm,
        startDate: startDatePrimario || 'no_start',
        endDate: endDatePrimario || 'no_end',
      };
      const key = `${keyObj.occupazioneNorm}|${keyObj.varietyNorm}|${keyObj.startDate}|${keyObj.endDate}`;

      // Get cadastral info
      const sezione = this.getValue(row, cols.sezione);
      const foglio = this.getValue(row, cols.foglio);
      const particella = this.getValue(row, cols.particella);
      const subalterno = this.getValue(row, cols.subalterno);
      const unitName = this.getValue(row, cols.unitName) || 'Unità produttiva';

      // Get or create aggregated unit
      let unit = aggregated.get(key);
      if (!unit) {
        // Determine crop name/type from occupation using LLM-identified cache
        const cropInfoPrimario = this.getCropIdentification(
          occupazionePrimariaName || occupazionePrimariaRaw,
          varietaPrimaria,
        );

        // Build unit name from occupation + variety
        const displayVariety = cropInfoPrimario.variety || varietaPrimaria;
        const unitDisplayName = displayVariety
          ? `${occupazionePrimariaName || occupazionePrimariaRaw} - ${displayVariety}`
          : occupazionePrimariaName || occupazionePrimariaRaw;

        // Create PRIMARY cycle
        const primaryCycle: ProductionCycleRaw = {
          cycleIndex: 0,
          cropName: cropInfoPrimario.cropName,
          cropType: cropInfoPrimario.cropType,
          cropCode: cropInfoPrimario.code,
          variety: cropInfoPrimario.variety || varietaPrimaria,
          occupazione: occupazionePrimariaRaw,
          destinazione: this.cleanBracketValue(this.getValue(row, cols.destinazioneUsoPrimario)),
          protectionStructure: this.getValue(row, cols.tipoSeminaPrimario) || null,
          startDate: startDatePrimario,
          endDate: endDatePrimario,
          floweringDate: null,
          harvestingDate: null,
        };

        unit = {
          name: unitDisplayName,
          sezione: null,
          foglio: null,
          particella: null,
          subalterno: null,
          areaHa: 0,
          protocoll: this.getValue(row, cols.rotazioneColturale) || 'AGEA',
          startDate: startDatePrimario,
          endDate: endDatePrimario,
          cycles: [primaryCycle],
          allocations: [],
        };
        aggregated.set(key, unit);

        // Check for SECONDARY cycle (if dates are present)
        const startDateSecondarioRaw = this.getValue(row, cols.dataInizioSeminaSecondario);
        const endDateSecondarioRaw = this.getValue(row, cols.dataFineSeminaSecondario);
        const startDateSecondario = this.parseDate(startDateSecondarioRaw);
        const endDateSecondario = this.parseDate(endDateSecondarioRaw);

        if (startDateSecondario || endDateSecondario) {
          const occupazioneSecondariaRaw = this.getValue(row, cols.occupazioneSuoloSecondario);
          const { name: occupazioneSecondariaName } = this.parseOccupazione(
            occupazioneSecondariaRaw || occupazionePrimariaRaw,
          );
          const varietaSecondariaRaw = this.getValue(row, cols.varietaUsoSuoloSecondario);
          const varietaSecondariaFromCsv =
            this.cleanBracketValue(varietaSecondariaRaw) || varietaPrimaria;

          const cropInfoSecondario = this.getCropIdentification(
            occupazioneSecondariaName || occupazionePrimariaName || occupazionePrimariaRaw,
            varietaSecondariaFromCsv,
          );

          const secondaryCycle: ProductionCycleRaw = {
            cycleIndex: 1,
            cropName: cropInfoSecondario.cropName,
            cropType: cropInfoSecondario.cropType,
            cropCode: cropInfoSecondario.code,
            variety: cropInfoSecondario.variety || varietaSecondariaFromCsv,
            occupazione: occupazioneSecondariaRaw || occupazionePrimariaRaw,
            destinazione: this.cleanBracketValue(
              this.getValue(row, cols.destinazioneUsoSecondario),
            ),
            protectionStructure: this.getValue(row, cols.tipoSeminaSecondario) || null,
            startDate: startDateSecondario,
            endDate: endDateSecondario,
            floweringDate: null,
            harvestingDate: null,
          };

          unit.cycles.push(secondaryCycle);

          // Extend unit dates to include secondary cycle
          if (endDateSecondario && (!unit.endDate || endDateSecondario > unit.endDate)) {
            unit.endDate = endDateSecondario;
          }
        }
      }

      // Find or create allocation for this field
      let allocation = unit.allocations.find(
        (a) =>
          a.foglio === foglio &&
          a.particella === particella &&
          (a.sezione ?? '') === (sezione ?? ''),
      );
      if (!allocation) {
        allocation = {
          fieldName: unitName,
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

      // Set cadastral info from first allocation
      if (!unit.sezione && sezione) {
        unit.sezione = sezione;
      }
      if (!unit.foglio && foglio) {
        unit.foglio = foglio;
      }
      if (!unit.particella && particella) {
        unit.particella = particella;
      }
      if (!unit.subalterno && subalterno) {
        unit.subalterno = subalterno;
      }

      // Merge period (extend min/max dates across all rows)
      const primaryStartDate = this.parseDate(this.getValue(row, cols.dataInizioSeminaPrimario));
      const secondaryEndDate = this.parseDate(this.getValue(row, cols.dataFineSeminaSecondario));
      const primaryEndDate = this.parseDate(this.getValue(row, cols.dataFineSeminaPrimario));

      if (primaryStartDate && (!unit.startDate || primaryStartDate < unit.startDate)) {
        unit.startDate = primaryStartDate;
      }
      if (secondaryEndDate && (!unit.endDate || secondaryEndDate > unit.endDate)) {
        unit.endDate = secondaryEndDate;
      } else if (primaryEndDate && (!unit.endDate || primaryEndDate > unit.endDate)) {
        unit.endDate = primaryEndDate;
      }
    }

    // Round areas to 4 decimal places
    for (const unit of aggregated.values()) {
      unit.areaHa = Math.round((unit.areaHa || 0) * 10000) / 10000;
      for (const alloc of unit.allocations) {
        alloc.areaHa = Math.round(alloc.areaHa * 10000) / 10000;
      }
    }

    return Array.from(aggregated.values());
  }

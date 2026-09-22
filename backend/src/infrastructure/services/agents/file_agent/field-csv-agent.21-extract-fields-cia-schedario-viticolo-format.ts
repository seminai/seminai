import { type ParsedRow } from './utils/csv_parser';
import { CIA_SCHEDARIO_VITICOLO_COLUMN_MAPPING, parseCiaNumber, getRegioneFromProvincia as getCiaRegione, normalizeVitignoName } from './template/cia_schedario_viticolo_file_structure';
import { ExtractedFieldData, FieldRecord, AggregatedField } from './field_csv_agent.support';
import type { FieldCsvAgentContext } from './field-csv-agent.context';

export function fieldCsvAgentExtractFieldsCiaSchedarioViticoloFormat(this: FieldCsvAgentContext, rows: ParsedRow[]): ExtractedFieldData {
    const cols = CIA_SCHEDARIO_VITICOLO_COLUMN_MAPPING;
    const particellaMap = new Map<string, AggregatedField>();

    for (const row of rows) {
      const foglio = this.getValue(row, cols.foglio);
      const particella = this.getValue(row, cols.particella);
      const sezione = this.getValue(row, cols.sezione) || null;

      // Skip rows without required cadastral data
      if (!foglio || !particella) {
        continue;
      }

      const comune = this.getValue(row, cols.comune);
      const provincia = this.getValue(row, cols.provincia);
      const regione = getCiaRegione(provincia);

      const key = `${foglio}_${particella}_${sezione || 'NOSEZ'}`;

      // Parse surfaces (all in MQ in this format)
      const supCatastaleMq = parseCiaNumber(this.getValue(row, cols.superficieCatastale));
      const supGisMq = parseCiaNumber(this.getValue(row, cols.superficieGis));
      const supVitataMq = parseCiaNumber(this.getValue(row, cols.supVitataDichiarata));

      // Get grape variety as land use
      const descrizioneVitigno = this.getValue(row, cols.descrizioneVitigno);
      const { name: vitignoName } = normalizeVitignoName(descrizioneVitigno);
      const usoSuolo = vitignoName ? `Vite - ${vitignoName}` : 'Vite';

      if (!particellaMap.has(key)) {
        particellaMap.set(key, {
          unitaProduttiva: '',
          regione: regione || null,
          provincia: provincia || null,
          comune,
          indirizzo: null,
          cap: null,
          sezione,
          foglio,
          particella,
          subalterno: null,
          // Superficie Catastale is the same for all UNARs of the same particella
          superficieCatastaleHa: supCatastaleMq !== null ? supCatastaleMq / 10000 : null,
          superficieGraficaHa: supGisMq !== null ? supGisMq / 10000 : null,
          // SAU is the sum of all SUP. VITATA DICHIARATA for this particella
          sauHa: supVitataMq !== null ? supVitataMq / 10000 : 0,
          usiSuolo: usoSuolo ? [usoSuolo] : [],
          qualita: null,
          dateInizio: [],
          dateFine: [],
        });
      } else {
        const existing = particellaMap.get(key)!;

        // Add uso suolo (grape variety) if not already present
        if (usoSuolo && !existing.usiSuolo.includes(usoSuolo)) {
          existing.usiSuolo.push(usoSuolo);
        }

        // Superficie Catastale: keep max (should be same for all UNARs of same particella)
        existing.superficieCatastaleHa = this.getMaxValue(
          existing.superficieCatastaleHa,
          supCatastaleMq !== null ? supCatastaleMq / 10000 : null,
        );
        existing.superficieGraficaHa = this.getMaxValue(
          existing.superficieGraficaHa,
          supGisMq !== null ? supGisMq / 10000 : null,
        );
        // SAU: SUM the vitata area for all UNARs
        if (supVitataMq !== null && supVitataMq > 0) {
          existing.sauHa = (existing.sauHa ?? 0) + supVitataMq / 10000;
        }
      }
    }

    const aggregatedFields = Array.from(particellaMap.values());
    console.log(
      `FieldCsvAgent: CIA Schedario Viticolo format - Aggregated ${aggregatedFields.length} fields`,
    );

    // Convert to output format
    const fields: FieldRecord[] = aggregatedFields.map((field, i) => {
      const superficieCatastaleMq =
        field.superficieCatastaleHa !== null && field.superficieCatastaleHa > 0
          ? Math.round(field.superficieCatastaleHa * 10000)
          : null;

      const sauHaValue = field.sauHa ?? 0;

      const cityName = field.comune || 'Unknown';
      const name =
        field.foglio && field.particella
          ? `${cityName} - F${field.foglio} P${field.particella}`
          : `${cityName} - Campo ${i + 1}`;

      // Combine all grape varieties as land use
      const uso = field.usiSuolo.filter((u) => u).join(', ') || 'Vite';

      return {
        name,
        nation: 'IT',
        region: field.regione,
        city: cityName,
        address: null,
        cap: null,
        foglio: field.foglio,
        particella: field.particella,
        subalterno: field.subalterno,
        sezione: field.sezione,
        superficieCatastaleMq,
        gisHa: field.superficieGraficaHa,
        sauHa: sauHaValue,
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
        inizioConduzione: null,
        fineConduzione: null,
      };
    });

    return { fields };
  }

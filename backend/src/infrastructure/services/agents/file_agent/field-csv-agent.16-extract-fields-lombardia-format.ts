import { type ParsedRow } from './utils/csv_parser';
import { LOMBARDIA_COLUMN_MAPPING, parseUsoSuoloFromTipoUtilizzo, parseLombardiaDate, getRegioneFromProvincia } from './template/lombardia_file_structure';
import { ExtractedFieldData, FieldRecord, AggregatedField } from './field_csv_agent.support';
import type { FieldCsvAgentContext } from './field-csv-agent.context';

export function fieldCsvAgentExtractFieldsLombardiaFormat(this: FieldCsvAgentContext, rows: ParsedRow[]): ExtractedFieldData {
    const cols = LOMBARDIA_COLUMN_MAPPING;
    const particellaMap = new Map<string, AggregatedField>();

    // Fill-down support
    let lastCuaa = '';
    let lastComune = '';
    let lastProvincia = '';
    let rowIndex = 0; // Counter for unique keys

    for (const row of rows) {
      rowIndex++;
      const foglio = this.getValue(row, cols.foglio);
      const mappale = this.getValue(row, cols.mappale); // Particella in Lombardia
      const sezione = this.getValue(row, cols.sezioneCensuaria) || null;

      // Skip rows without required cadastral data
      if (!foglio || !mappale) {
        continue;
      }

      // Fill-down logic
      const cuaa = this.getValue(row, cols.cuaa) || lastCuaa;
      const comune = this.getValue(row, cols.comune) || lastComune;
      const provincia = this.getValue(row, cols.provincia) || lastProvincia;

      if (cuaa) lastCuaa = cuaa;
      if (comune) lastComune = comune;
      if (provincia) lastProvincia = provincia;

      // For Lombardia, create a unique field for each row (each TIPO UTILIZZO)
      // This ensures that fields with multiple land uses are imported as separate fields
      const tipoUtilizzo = this.getValue(row, cols.tipoUtilizzo);
      const key = `${foglio}_${mappale}_${sezione || 'NOSEZ'}_${tipoUtilizzo || rowIndex}`;

      // Parse surfaces (all in MQ in Lombardia format)
      const supGis = this.parseNumber(this.getValue(row, cols.superficieGis));
      const supUtilizzata = this.parseNumber(this.getValue(row, cols.superficieUtilizzata));
      const supCatastale = this.parseNumber(this.getValue(row, cols.superficieCatastale));
      const superficie = this.parseNumber(this.getValue(row, cols.superficie));

      // Use the best available surface value
      const superficieMq = supCatastale ?? supGis ?? supUtilizzata ?? superficie;

      // Parse uso suolo from TIPO UTILIZZO (tipoUtilizzo already declared above for key)
      const usoSuolo = parseUsoSuoloFromTipoUtilizzo(tipoUtilizzo);

      // Parse dates
      const dataFineContratto = this.getValue(row, cols.dataFineContratto);
      const dataSemina = this.getValue(row, cols.dataSemina);
      const dataRaccolta = this.getValue(row, cols.dataRaccolta);

      // Get region from province
      const regione = getRegioneFromProvincia(provincia);

      if (!particellaMap.has(key)) {
        particellaMap.set(key, {
          unitaProduttiva: cuaa,
          regione,
          provincia,
          comune,
          indirizzo: null,
          cap: null,
          sezione,
          foglio,
          particella: mappale,
          subalterno: this.getValue(row, cols.subalterno) || null,
          superficieCatastaleHa: superficieMq !== null ? superficieMq / 10000 : null,
          superficieGraficaHa: supGis !== null ? supGis / 10000 : null,
          sauHa: supUtilizzata !== null ? supUtilizzata / 10000 : null,
          usiSuolo: usoSuolo ? [usoSuolo] : [],
          qualita: null,
          dateInizio: dataSemina ? [dataSemina] : [],
          dateFine: dataFineContratto ? [dataFineContratto] : dataRaccolta ? [dataRaccolta] : [],
        });
      } else {
        // Aggregate
        const existing = particellaMap.get(key)!;
        if (usoSuolo && !existing.usiSuolo.includes(usoSuolo)) {
          existing.usiSuolo.push(usoSuolo);
        }
        if (dataSemina && !existing.dateInizio.includes(dataSemina)) {
          existing.dateInizio.push(dataSemina);
        }
        const endDate = dataFineContratto || dataRaccolta;
        if (endDate && !existing.dateFine.includes(endDate)) {
          existing.dateFine.push(endDate);
        }
        // Update surfaces with max values
        const newSupHa = superficieMq !== null ? superficieMq / 10000 : null;
        existing.superficieCatastaleHa = this.getMaxValue(existing.superficieCatastaleHa, newSupHa);
        existing.superficieGraficaHa = this.getMaxValue(
          existing.superficieGraficaHa,
          supGis !== null ? supGis / 10000 : null,
        );
        existing.sauHa = this.getMaxValue(
          existing.sauHa,
          supUtilizzata !== null ? supUtilizzata / 10000 : null,
        );
      }
    }

    const aggregatedFields = Array.from(particellaMap.values());
    console.log(`FieldCsvAgent: Lombardia format - Aggregated ${aggregatedFields.length} fields`);

    // Convert to output format
    const fields: FieldRecord[] = aggregatedFields.map((field, i) => {
      const superficieCatastaleMq =
        field.superficieCatastaleHa !== null
          ? Math.round(field.superficieCatastaleHa * 10000)
          : null;

      const cityName = field.comune || 'Unknown';
      const usoLabel = field.usiSuolo[0] ? ` - ${field.usiSuolo[0].substring(0, 40)}` : '';
      const name =
        field.foglio && field.particella
          ? `${cityName} - F${field.foglio} P${field.particella}${usoLabel}`
          : `${cityName} - Campo ${i + 1}${usoLabel}`;

      // Convert Lombardia dates (DD/MM/YYYY) to ISO
      const inizioConduzione = field.dateInizio[0] ? parseLombardiaDate(field.dateInizio[0]) : null;
      const fineConduzione = field.dateFine[0] ? parseLombardiaDate(field.dateFine[0]) : null;

      // Filter out non-agricultural uses
      const uso = field.usiSuolo.filter((u) => u && u !== 'USO NON AGRICOLO').join(', ') || null;

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
        sauHa: field.sauHa,
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

    return { fields };
  }

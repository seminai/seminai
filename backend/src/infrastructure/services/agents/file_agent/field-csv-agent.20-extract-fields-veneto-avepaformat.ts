import { type ParsedRow } from './utils/csv_parser';
import { parseComuneDescrizione as parseVenetoComuneDescrizione, getRegioneFromProvincia as getVenetoRegione, getRegioneFromComune as getVenetoRegioneFromComune, parsePrimaColturaColumn } from './template/veneto_file_structure';
import { ExtractedFieldData, FieldRecord } from './field_csv_agent.support';
import type { FieldCsvAgentContext } from './field-csv-agent.context';

export function fieldCsvAgentExtractFieldsVenetoAVEPAFormat(this: FieldCsvAgentContext, rows: ParsedRow[], headers: string[]): ExtractedFieldData {
    const fields: FieldRecord[] = [];

    // Log headers for debugging
    console.log(`FieldCsvAgent: AVEPA headers: ${headers.slice(0, 30).join(', ')}`);

    // Find the crop description column (usually Column_24, the one after "1a Coltura")
    const colturaDescColumnIndex = headers.findIndex((h) => h === '1a Coltura') + 2; // Skip one empty column
    const colturaDescColumnName = headers[colturaDescColumnIndex] || 'Column_24';

    console.log(
      `FieldCsvAgent: AVEPA crop description column: "${colturaDescColumnName}" at index ${colturaDescColumnIndex}`,
    );

    let rowIndex = 0;
    for (const row of rows) {
      rowIndex++;

      // Get cadastral info using the actual column names from the detector
      const comune = this.getValue(row, 'Comune') || '';
      const sezione = this.getValue(row, 'Sez') || null;
      const foglio = this.getValue(row, 'Fog.') || this.getValue(row, 'Foglio') || null;
      const particella = this.getValue(row, 'Particella') || this.getValue(row, 'Part.') || null;
      const subalterno = this.getValue(row, 'Sub') || null;

      // Skip rows without required cadastral data
      if (!foglio || !particella) {
        console.log(`FieldCsvAgent: AVEPA row ${rowIndex} skipped - missing foglio or particella`);
        continue;
      }

      // Get coltura description from Column_24 (or similar unlabeled column)
      // This contains values like "ORZO - FAVE, SEMI, GRANELLA - ORZO"
      const colturaDesc =
        this.getValue(row, colturaDescColumnName) || this.getValue(row, 'Column_24') || '';
      const { name: colturaName } = parsePrimaColturaColumn(colturaDesc);

      // Get surfaces - ALL values in AVEPA format are in MQ (square meters)
      // Example: Sup. Catastale = 2437 MQ, Sup. Utilizzata = 2162 MQ, 42 MQ, etc.
      // Always convert to HA by dividing by 10000
      const supCatastaleRaw = this.getValue(row, 'Sup. Catastale') || '';
      const supCatastaleNum = this.parseNumber(supCatastaleRaw);
      const supCatastaleHa = supCatastaleNum !== null ? supCatastaleNum / 10000 : null;

      const supUtilizzataRaw = this.getValue(row, 'Sup. Utilizzata') || '';
      const supUtilizzataNum = this.parseNumber(supUtilizzataRaw);
      const supUtilizzataHa = supUtilizzataNum !== null ? supUtilizzataNum / 10000 : null;

      // Parse comune to extract city name and province (e.g., "ARCOLE (VR)" -> ARCOLE, VR)
      const { comune: cityName, provincia } = parseVenetoComuneDescrizione(comune);
      const regione = provincia
        ? getVenetoRegione(provincia)
        : getVenetoRegioneFromComune(cityName) || 'VENETO';

      // Convert HA to MQ for superficieCatastale output
      const superficieCatastaleMq =
        supCatastaleHa !== null && supCatastaleHa > 0 ? Math.round(supCatastaleHa * 10000) : null;

      // SAU is taken directly from "Sup. Utilizzata" - all rows are included
      const sauHaValue = supUtilizzataHa ?? 0;

      // Build field name with row index for uniqueness
      const name = `${cityName || 'Unknown'} - F${foglio} P${particella}${subalterno ? ` S${subalterno}` : ''} [${rowIndex}]`;

      fields.push({
        name,
        nation: 'IT',
        region: regione,
        city: cityName || 'Unknown',
        address: null,
        cap: null,
        foglio,
        particella,
        subalterno,
        sezione,
        superficieCatastaleMq,
        gisHa: null,
        sauHa: sauHaValue,
        variazioneMq: null,
        uso: colturaName || null,
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
      });
    }

    console.log(
      `FieldCsvAgent: Veneto AVEPA format - Extracted ${fields.length} fields (1 per row)`,
    );

    return { fields };
  }

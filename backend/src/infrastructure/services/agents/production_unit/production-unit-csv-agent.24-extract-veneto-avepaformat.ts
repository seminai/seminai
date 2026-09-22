import { type ParsedRow } from '../file_agent/utils/csv_parser';
import { parsePacCodeFromColumn, parsePrimaColturaColumn, parseAVEPASuperficie, findPacCodeColumnIndex, parseComuneDescrizione as parseVenetoComuneDescrizione } from '../file_agent/template/veneto_file_structure';
import { batchInterpretPacCodes, parsePacCodeString, isNonAgriculturalPacCode } from '../../tool/agea_pac_codification';
import { ProductionCycleRaw, ProductionUnitRaw } from './production_unit_csv_agent.support';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export async function productionUnitCsvAgentExtractVenetoAVEPAFormat(this: ProductionUnitCsvAgentContext, rows: ParsedRow[], headers: string[]): Promise<ProductionUnitRaw[]> {
    const aggregated = new Map<string, ProductionUnitRaw>();

    // Find PAC code column index
    const sampleRow = rows[0] ? Object.values(rows[0]) : [];
    const pacCodeColumnIndex = findPacCodeColumnIndex(headers, sampleRow as string[]);
    const pacCodeColumnName = headers[pacCodeColumnIndex] || '';

    // Find crop description column (usually 2 positions after "1a Coltura" header, which contains PAC codes)
    // The actual crop description text (e.g., "GRANTURCO (MAIS) - DA FORAGGIO") is in an unlabeled column
    const colturaHeaderIndex = headers.findIndex(
      (h) => h === '1a Coltura' || h === '1a coltura' || h === 'Prima Coltura',
    );
    const colturaDescColumnIndex = colturaHeaderIndex >= 0 ? colturaHeaderIndex + 2 : -1;
    const colturaDescColumnName =
      colturaDescColumnIndex >= 0 ? headers[colturaDescColumnIndex] || 'Column_24' : '';

    console.log(
      `ProductionUnitCsvAgent: AVEPA PAC code column: "${pacCodeColumnName}" at index ${pacCodeColumnIndex}`,
    );
    console.log(
      `ProductionUnitCsvAgent: AVEPA crop description column: "${colturaDescColumnName}" at index ${colturaDescColumnIndex}`,
    );

    // Collect unique PAC codes for batch interpretation
    const pacCodesSet = new Map<string, { pacCode: string; colturaDescription?: string }>();

    for (const row of rows) {
      // Try to find PAC code from known column or by pattern matching
      let pacCodeRaw: string | null = null;
      let colturaDescription: string | null = null;

      // First try the detected column
      if (pacCodeColumnName && row[pacCodeColumnName]) {
        pacCodeRaw = parsePacCodeFromColumn(row[pacCodeColumnName]);
      }

      // If not found, search all columns for PAC pattern
      if (!pacCodeRaw) {
        for (const value of Object.values(row)) {
          const parsed = parsePacCodeFromColumn(value);
          if (parsed) {
            pacCodeRaw = parsed;
            break;
          }
        }
      }

      // Get coltura description from the actual description column (offset +2 from "1a Coltura")
      // "1a Coltura" column itself contains PAC codes, the real description is 2 columns ahead
      if (colturaDescColumnName) {
        const descValue = row[colturaDescColumnName] || row['Column_24'] || '';
        if (descValue && !parsePacCodeFromColumn(descValue)) {
          const { name } = parsePrimaColturaColumn(descValue);
          colturaDescription = name;
        }
      }

      // Skip if no PAC code found
      if (!pacCodeRaw) continue;

      // Skip non-agricultural uses
      if (isNonAgriculturalPacCode(pacCodeRaw)) continue;

      // Collect for batch processing
      if (!pacCodesSet.has(pacCodeRaw)) {
        pacCodesSet.set(pacCodeRaw, {
          pacCode: pacCodeRaw,
          colturaDescription: colturaDescription || undefined,
        });
      }
    }

    // Batch interpret PAC codes
    const pacCodesArray = Array.from(pacCodesSet.values());
    console.log(`ProductionUnitCsvAgent: Interpreting ${pacCodesArray.length} unique PAC codes`);

    const pacInterpretations = await batchInterpretPacCodes(pacCodesArray);

    // Process rows
    for (const row of rows) {
      // Find PAC code
      let pacCodeRaw: string | null = null;
      if (pacCodeColumnName && row[pacCodeColumnName]) {
        pacCodeRaw = parsePacCodeFromColumn(row[pacCodeColumnName]);
      }
      if (!pacCodeRaw) {
        for (const value of Object.values(row)) {
          const parsed = parsePacCodeFromColumn(value);
          if (parsed) {
            pacCodeRaw = parsed;
            break;
          }
        }
      }

      if (!pacCodeRaw) continue;

      // Skip non-agricultural
      if (isNonAgriculturalPacCode(pacCodeRaw)) continue;

      // Get crop interpretation
      const pacParsed = parsePacCodeString(pacCodeRaw);
      const cropInfo = pacParsed ? pacInterpretations.get(pacParsed.full) : null;

      if (!cropInfo || !cropInfo.isAgricultural) continue;

      // Get area from "Sup. Utilizzata" or "Sup. Catastale"
      const supUtilizzata = row['Sup. Utilizzata'] || row['sup. utilizzata'] || '';
      const supCatastale = row['Sup. Catastale'] || row['sup. catastale'] || '';
      const areaHa = parseAVEPASuperficie(supUtilizzata) || parseAVEPASuperficie(supCatastale);

      if (areaHa === null || areaHa <= 0) continue;

      // Get cadastral info
      const comune = row['Comune'] || row['comune'] || '';
      const sezione = (row['Sez'] || row['sez'] || row['Sezione'] || '').trim() || null;
      const foglio = (row['Fog.'] || row['fog.'] || row['Foglio'] || '').trim() || null;
      const particella = (row['Part.'] || row['part.'] || row['Particella'] || '').trim() || null;
      const subalterno = (row['Sub'] || row['sub'] || row['Subalterno'] || '').trim() || null;

      // Parse comune
      const { comune: comuneName } = parseVenetoComuneDescrizione(comune);

      // Get coltura info
      const cropName = cropInfo.cropType;
      const variety = cropInfo.variety;
      const cropCode = cropInfo.code;

      // Build aggregation key: Crop + Variety + Comune
      const cropNorm = this.normalizeString(cropName);
      const varietyNorm = variety ? this.normalizeString(variety) : '';
      const comuneNorm = this.normalizeString(comuneName);
      const key = `${cropNorm}|${varietyNorm}|${comuneNorm}`;

      // Get or create aggregated unit
      let unit = aggregated.get(key);
      if (!unit) {
        const comuneLabel = comuneName ? ` (${comuneName})` : '';
        const unitDisplayName = variety
          ? `${cropName} - ${variety}${comuneLabel}`
          : `${cropName}${comuneLabel}`;

        // Create primary cycle
        const primaryCycle: ProductionCycleRaw = {
          cycleIndex: 0,
          cropName: cropInfo.species,
          cropType: cropName,
          cropCode,
          variety,
          occupazione: pacCodeRaw,
          destinazione: null,
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
          subalterno,
          areaHa: 0,
          protocoll: 'VENETO_AVEPA',
          startDate: null,
          endDate: null,
          cycles: [primaryCycle],
          allocations: [],
        };
        aggregated.set(key, unit);
      }

      // Build field name
      const fieldName = `${comuneName} - F${foglio || '?'} P${particella || '?'}`;

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
      `ProductionUnitCsvAgent: Veneto AVEPA format - Extracted ${result.length} production units`,
    );

    return result;
  }

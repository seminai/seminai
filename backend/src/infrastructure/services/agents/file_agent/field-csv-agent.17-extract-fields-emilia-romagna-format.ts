import { type ParsedRow } from './utils/csv_parser';
import { EMILIA_ROMAGNA_COLUMN_MAPPING, parseUsoSuoloFromOccupazione, parseEmiliaRomagnaDate, parseEmiliaRomagnaSuperficie, isNonAgriculturalUse as isEmiliaRomagnaNonAgricultural, isSauRow, normalizeRegione } from './template/emilia_romagna_file_structure';
import { ExtractedFieldData, FieldRecord, AggregatedField } from './field_csv_agent.support';
import type { FieldCsvAgentContext } from './field-csv-agent.context';

export function fieldCsvAgentExtractFieldsEmiliaRomagnaFormat(this: FieldCsvAgentContext, rows: ParsedRow[]): ExtractedFieldData {
    const cols = EMILIA_ROMAGNA_COLUMN_MAPPING;
    const particellaMap = new Map<string, AggregatedField>();

    // Fill-down support
    let lastCuaa = '';
    let lastRagioneSociale = '';
    let lastComune = '';
    let lastProvincia = '';
    let lastRegione = '';

    for (const row of rows) {
      // Try both "FOGLIO " (with space) and "FOGLIO" (without space)
      let foglio = this.getValue(row, cols.foglio);
      if (!foglio) {
        foglio = this.getValue(row, 'FOGLIO');
      }
      const particella = this.getValue(row, cols.particella);
      const subalterno = this.getValue(row, cols.subalterno) || null;

      // Skip rows without required cadastral data
      if (!foglio || !particella) {
        continue;
      }

      // Fill-down logic
      const cuaa = this.getValue(row, cols.cuaa) || lastCuaa;
      const ragioneSociale = this.getValue(row, cols.ragioneSociale) || lastRagioneSociale;
      const comune = this.getValue(row, cols.comune) || lastComune;
      const provincia = this.getValue(row, cols.provincia) || lastProvincia;
      const regione = this.getValue(row, cols.regione) || lastRegione;

      if (cuaa) lastCuaa = cuaa;
      if (ragioneSociale) lastRagioneSociale = ragioneSociale;
      if (comune) lastComune = comune;
      if (provincia) lastProvincia = provincia;
      if (regione) lastRegione = regione;

      // Normalize particella (remove leading zeros for key but keep original)
      const normalizedParticella = particella.replace(/^0+/, '') || particella;
      const key = `${foglio}_${normalizedParticella}_${subalterno || 'NOSUB'}`;

      // Parse superficie (already in HA in Emilia-Romagna format)
      const superficieHa = parseEmiliaRomagnaSuperficie(this.getValue(row, cols.superficieHa));

      // Parse uso suolo from OCCUPAZIONE SUOLO
      const occupazioneSuolo = this.getValue(row, cols.occupazioneSuolo);
      const usoSuolo = parseUsoSuoloFromOccupazione(occupazioneSuolo);

      // Skip non-agricultural uses for SAU calculation
      // FLAG SAU = 'N' is the authoritative AGEA indicator (covers BOSCO, USO FORESTALE, etc.)
      const flagSauValue = this.getValue(row, cols.flagSau) ?? '';
      const isNonAgricultural =
        (flagSauValue.trim() !== '' && !isSauRow(flagSauValue)) ||
        isEmiliaRomagnaNonAgricultural(occupazioneSuolo);

      // Parse dates (DD-MM-YYYY format)
      const dataInizioUtilizzo = this.getValue(row, cols.dataInizioUtilizzo);
      const dataFineUtilizzo = this.getValue(row, cols.dataFineUtilizzo);

      // Get qualita
      const qualita = this.getValue(row, cols.qualita) || null;

      if (!particellaMap.has(key)) {
        particellaMap.set(key, {
          unitaProduttiva: ragioneSociale || cuaa,
          regione: normalizeRegione(regione),
          provincia,
          comune,
          indirizzo: null,
          cap: null,
          sezione: null, // Emilia-Romagna format doesn't have sezione in the same way
          foglio,
          particella: normalizedParticella,
          subalterno,
          // Sum all surfaces (each row is a different portion/use of the same particella)
          superficieCatastaleHa: superficieHa ?? 0,
          superficieGraficaHa: null, // Not available in this format
          // SAU starts at 0 and sums only agricultural surfaces
          sauHa: isNonAgricultural ? 0 : superficieHa ?? 0,
          // Include ALL uses (agricultural and non-agricultural) for visibility
          usiSuolo: usoSuolo ? [usoSuolo] : [],
          qualita,
          dateInizio: dataInizioUtilizzo ? [dataInizioUtilizzo] : [],
          dateFine: dataFineUtilizzo ? [dataFineUtilizzo] : [],
        });
      } else {
        // Aggregate
        const existing = particellaMap.get(key)!;

        // Add uso suolo if not duplicate (include non-agricultural for visibility)
        if (usoSuolo && !existing.usiSuolo.includes(usoSuolo)) {
          existing.usiSuolo.push(usoSuolo);
        }

        // Add dates if not duplicate
        if (dataInizioUtilizzo && !existing.dateInizio.includes(dataInizioUtilizzo)) {
          existing.dateInizio.push(dataInizioUtilizzo);
        }
        if (dataFineUtilizzo && !existing.dateFine.includes(dataFineUtilizzo)) {
          existing.dateFine.push(dataFineUtilizzo);
        }

        // Update surfaces - SUM all portions (each row is a different use of the particella)
        if (superficieHa !== null && superficieHa > 0) {
          // Sum all surfaces for total catastale area
          existing.superficieCatastaleHa = (existing.superficieCatastaleHa ?? 0) + superficieHa;

          // For SAU, sum only agricultural surfaces
          if (!isNonAgricultural) {
            existing.sauHa = (existing.sauHa ?? 0) + superficieHa;
          }
        }
      }
    }

    const aggregatedFields = Array.from(particellaMap.values());
    console.log(
      `FieldCsvAgent: Emilia-Romagna format - Aggregated ${aggregatedFields.length} fields`,
    );

    // Convert to output format
    const fields: FieldRecord[] = aggregatedFields.map((field, i) => {
      // Convert HA to MQ, keeping precision for small values
      // 0.0042 ha = 42 mq, 0.0002 ha = 2 mq
      const superficieCatastaleMq =
        field.superficieCatastaleHa !== null && field.superficieCatastaleHa > 0
          ? Math.round(field.superficieCatastaleHa * 10000)
          : null;

      // Keep SAU in HA, null only if truly 0 or not set
      // SAU is 0 for non-agricultural land, not null (to avoid errors)
      const sauHaValue = field.sauHa ?? 0;

      const cityName = field.comune || 'Unknown';
      const name =
        field.foglio && field.particella
          ? `${cityName} - F${field.foglio} P${field.particella}`
          : `${cityName} - Campo ${i + 1}`;

      // Convert Emilia-Romagna dates (DD-MM-YYYY) to ISO
      const inizioConduzione = field.dateInizio[0]
        ? parseEmiliaRomagnaDate(field.dateInizio[0])
        : null;
      const fineConduzione = field.dateFine[0] ? parseEmiliaRomagnaDate(field.dateFine[0]) : null;

      // Include ALL uses (agricultural and non-agricultural) for visibility
      const uso = field.usiSuolo.filter((u) => u).join(', ') || null;

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
        qualita: field.qualita,
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

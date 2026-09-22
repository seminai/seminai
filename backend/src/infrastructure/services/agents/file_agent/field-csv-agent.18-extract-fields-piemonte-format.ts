import { type ParsedRow } from './utils/csv_parser';
import { PIEMONTE_COLUMN_MAPPING, parseUsoSuoloFromOccupazione as parsePiemonteUsoSuolo, parsePiemonteDate, parsePiemonteSuperficie, parseComuneDescrizione, parseUnitaProduttiva, isNonAgriculturalUse as isPiemonteNonAgricultural, getRegioneFromProvincia as getPiemonteRegione, getRegioneFromComune } from './template/piemonte_file_structure';
import { ExtractedFieldData, FieldRecord, AggregatedField } from './field_csv_agent.support';
import type { FieldCsvAgentContext } from './field-csv-agent.context';

export function fieldCsvAgentExtractFieldsPiemonteFormat(this: FieldCsvAgentContext, rows: ParsedRow[]): ExtractedFieldData {
    const cols = PIEMONTE_COLUMN_MAPPING;
    const particellaMap = new Map<string, AggregatedField>();

    // Fill-down support
    let lastUnitaProduttiva = '';
    let lastComuneDescrizione = '';

    for (const row of rows) {
      const foglio = this.getValue(row, cols.foglio);
      const particella = this.getValue(row, cols.particella);
      const sezione = this.getValue(row, cols.sezione) || null;
      const subalterno = this.getValue(row, cols.subalterno) || null;

      // Skip rows without required cadastral data
      if (!foglio || !particella) {
        continue;
      }

      // Fill-down logic
      const unitaProduttiva = this.getValue(row, cols.unitaProduttiva) || lastUnitaProduttiva;
      const comuneDescrizione = this.getValue(row, cols.comuneDescrizione) || lastComuneDescrizione;

      if (unitaProduttiva) lastUnitaProduttiva = unitaProduttiva;
      if (comuneDescrizione) lastComuneDescrizione = comuneDescrizione;

      // Parse comune and provincia
      const { comune, provincia } = parseComuneDescrizione(comuneDescrizione);
      // Determine region: first try from provincia, then from comune name
      const regione = provincia
        ? getPiemonteRegione(provincia)
        : getRegioneFromComune(comune) || 'ITALIA';

      // Parse unita produttiva for address
      const { address } = parseUnitaProduttiva(unitaProduttiva);

      const key = `${foglio}_${particella}_${sezione || 'NOSEZ'}_${subalterno || 'NOSUB'}`;

      // Parse surfaces (all in HA in Piemonte format)
      const superficieCatastaleHa = parsePiemonteSuperficie(
        this.getValue(row, cols.superficieCatastale),
      );
      const superficieGraficaHa = parsePiemonteSuperficie(
        this.getValue(row, cols.superficieGrafica),
      );
      const superficieAgricolaHa = parsePiemonteSuperficie(
        this.getValue(row, cols.superficieAgricola),
      );
      const superficiePrimarioHa = parsePiemonteSuperficie(
        this.getValue(row, cols.superficiePrimario),
      );

      // Parse uso suolo from occupazione primario
      const occupazionePrimario = this.getValue(row, cols.occupazioneSuoloPrimario);
      const usoSuolo = parsePiemonteUsoSuolo(occupazionePrimario);

      // Check if non-agricultural
      const isNonAgricultural = isPiemonteNonAgricultural(occupazionePrimario);

      // Parse dates
      const dataInizio = this.getValue(row, cols.dataInizioSeminaPrimario);
      const dataFine = this.getValue(row, cols.dataFineSeminaPrimario);

      // Get qualita
      const qualita = this.getValue(row, cols.qualitaPrimario);
      const qualitaParsed =
        qualita && qualita !== '[000] -' ? qualita.replace(/^\[\d+\]\s*/, '') : null;

      if (!particellaMap.has(key)) {
        particellaMap.set(key, {
          unitaProduttiva,
          regione,
          provincia,
          comune,
          indirizzo: address,
          cap: null,
          sezione,
          foglio,
          particella,
          subalterno,
          superficieCatastaleHa: superficieCatastaleHa ?? 0,
          superficieGraficaHa: superficieGraficaHa ?? null,
          // SAU starts at 0 and sums only agricultural surfaces
          sauHa: isNonAgricultural ? 0 : superficiePrimarioHa ?? superficieAgricolaHa ?? 0,
          usiSuolo: usoSuolo ? [usoSuolo] : [],
          qualita: qualitaParsed,
          dateInizio: dataInizio ? [dataInizio] : [],
          dateFine: dataFine ? [dataFine] : [],
        });
      } else {
        // Aggregate
        const existing = particellaMap.get(key)!;

        // Add uso suolo if not duplicate
        if (usoSuolo && !existing.usiSuolo.includes(usoSuolo)) {
          existing.usiSuolo.push(usoSuolo);
        }

        // Add dates if not duplicate
        if (dataInizio && !existing.dateInizio.includes(dataInizio)) {
          existing.dateInizio.push(dataInizio);
        }
        if (dataFine && !existing.dateFine.includes(dataFine)) {
          existing.dateFine.push(dataFine);
        }

        // Update surfaces - SUM all portions
        if (superficiePrimarioHa !== null && superficiePrimarioHa > 0) {
          // For SAU, sum only agricultural surfaces
          if (!isNonAgricultural) {
            existing.sauHa = (existing.sauHa ?? 0) + superficiePrimarioHa;
          }
        }

        // Keep max catastale and grafica
        existing.superficieCatastaleHa = this.getMaxValue(
          existing.superficieCatastaleHa,
          superficieCatastaleHa,
        );
        existing.superficieGraficaHa = this.getMaxValue(
          existing.superficieGraficaHa,
          superficieGraficaHa,
        );
      }
    }

    const aggregatedFields = Array.from(particellaMap.values());
    console.log(`FieldCsvAgent: Piemonte format - Aggregated ${aggregatedFields.length} fields`);

    // Convert to output format
    const fields: FieldRecord[] = aggregatedFields.map((field, i) => {
      // Convert HA to MQ
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

      // Convert Piemonte dates (DD/MM/YYYY) to ISO
      const inizioConduzione = field.dateInizio[0] ? parsePiemonteDate(field.dateInizio[0]) : null;
      const fineConduzione = field.dateFine[0] ? parsePiemonteDate(field.dateFine[0]) : null;

      // Filter non-agricultural uses for display
      const uso = field.usiSuolo.filter((u) => u).join(', ') || null;

      return {
        name,
        nation: 'IT',
        region: field.regione,
        city: cityName,
        address: field.indirizzo,
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

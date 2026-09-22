import { type ParsedRow } from './utils/csv_parser';
import { FieldColumnMapping, AggregatedField } from './field_csv_agent.support';
import type { FieldCsvAgentContext } from './field-csv-agent.context';

export function fieldCsvAgentAggregateByParticella(this: FieldCsvAgentContext, rows: ParsedRow[], mapping: FieldColumnMapping): AggregatedField[] {
    const cols = mapping.columns;
    const particellaMap = new Map<string, AggregatedField>();

    // Fill-down support for repeated values
    let lastUnitaProduttiva = '';
    let lastComune = '';
    let lastRegione = '';
    let lastProvincia = '';

    for (const row of rows) {
      const foglio = this.getValue(row, cols.foglio);
      const particella = this.getValue(row, cols.particella);
      const sezione = this.getValue(row, cols.sezione) || null;

      // Fill-down logic
      const unitaProduttiva = this.getValue(row, cols.unitaProduttiva) || lastUnitaProduttiva;
      const comune = this.getValue(row, cols.comune) || lastComune;
      const regione = this.getValue(row, cols.regione) || lastRegione;
      const provincia = this.getValue(row, cols.provincia) || lastProvincia;

      if (unitaProduttiva) lastUnitaProduttiva = unitaProduttiva;
      if (comune) lastComune = comune;
      if (regione) lastRegione = regione;
      if (provincia) lastProvincia = provincia;

      const key = `${foglio}_${particella}_${sezione || 'NOSEZ'}`;

      // Parse surfaces
      const supCatValue = this.getValue(row, cols.superficieCatastale);
      const supGrafValue = this.getValue(row, cols.superficieGrafica);
      const sauValue = this.getValue(row, cols.sau);

      const supCatHa = this.parseAreaToHa(supCatValue, mapping.superficieUnit);
      const supGrafHa = this.parseAreaToHa(supGrafValue, mapping.superficieUnit);
      const sauHa = this.parseAreaToHa(sauValue, mapping.superficieUnit);

      // Get uso suolo and qualita
      const usoSuolo = this.getValue(row, cols.usoSuolo);
      const qualita = this.getValue(row, cols.qualita) || null;

      // Get dates
      const dataInizio = this.getValue(row, cols.dataInizio);
      const dataFine = this.getValue(row, cols.dataFine);

      if (!particellaMap.has(key)) {
        // First occurrence: create the field
        particellaMap.set(key, {
          unitaProduttiva,
          regione: regione || null,
          provincia: provincia || null,
          comune,
          indirizzo: this.getValue(row, cols.indirizzo) || null,
          cap: this.getValue(row, cols.cap) || null,
          sezione,
          foglio,
          particella,
          subalterno: this.getValue(row, cols.subalterno) || null,
          superficieCatastaleHa: supCatHa,
          superficieGraficaHa: supGrafHa,
          sauHa,
          usiSuolo: usoSuolo ? [usoSuolo] : [],
          qualita,
          dateInizio: dataInizio ? [dataInizio] : [],
          dateFine: dataFine ? [dataFine] : [],
        });
      } else {
        // Aggregate: add uso and dates, take max surfaces
        const existing = particellaMap.get(key)!;
        if (usoSuolo && !existing.usiSuolo.includes(usoSuolo)) {
          existing.usiSuolo.push(usoSuolo);
        }
        if (dataInizio && !existing.dateInizio.includes(dataInizio)) {
          existing.dateInizio.push(dataInizio);
        }
        if (dataFine && !existing.dateFine.includes(dataFine)) {
          existing.dateFine.push(dataFine);
        }
        // Update surfaces with max values
        existing.superficieCatastaleHa = this.getMaxValue(existing.superficieCatastaleHa, supCatHa);
        existing.superficieGraficaHa = this.getMaxValue(existing.superficieGraficaHa, supGrafHa);
        existing.sauHa = this.getMaxValue(existing.sauHa, sauHa);
      }
    }

    return Array.from(particellaMap.values());
  }

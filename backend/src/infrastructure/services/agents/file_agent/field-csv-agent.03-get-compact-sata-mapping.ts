import { normalizeString as sharedNormalizeString } from './utils/csv_parser';
import { FieldColumnMapping } from './field_csv_agent.support';
import type { FieldCsvAgentContext } from './field-csv-agent.context';

export function fieldCsvAgentGetCompactSataMapping(this: FieldCsvAgentContext, headers: string[]): FieldColumnMapping | null {
    const headerByKey = new Map(headers.map((header) => [sharedNormalizeString(header), header]));
    const pick = (...keys: string[]): string | null => {
      for (const key of keys) {
        const header = headerByKey.get(sharedNormalizeString(key));
        if (header) return header;
      }
      return null;
    };

    const fieldName = pick('Nome campo');
    const foglio = pick('Fog.', 'Foglio');
    const particella = pick('Part.', 'Particella');
    const superficieCatastale = pick('Sup. catast.', 'Superficie Catastale');
    const crop = pick('Coltura primaria');

    if (!fieldName || !foglio || !particella || !superficieCatastale || !crop) {
      return null;
    }

    return {
      columns: {
        unitaProduttiva: fieldName,
        regione: null,
        provincia: null,
        comune: null,
        cap: null,
        indirizzo: null,
        sezione: pick('Sez.', 'Sezione'),
        foglio,
        particella,
        subalterno: pick('Sub', 'Subalterno'),
        superficieCatastale,
        superficieGrafica: pick('Sup. grafica', 'Superficie Grafica'),
        sau: pick('Sup. uso primario', 'Superficie uso primario'),
        usoSuolo: crop,
        qualita: pick('Dest. uso', 'Destinazione uso'),
        dataInizio: pick('Inizio semina', 'Data inizio semina'),
        dataFine: pick('Fine semina', 'Data fine semina'),
      },
      superficieUnit: 'HA',
      dateFormat: 'DD/MM/YYYY',
    };
  }

import { FieldColumnMapping, FieldRecord, AggregatedField } from './field_csv_agent.support';
import type { FieldCsvAgentContext } from './field-csv-agent.context';

export function fieldCsvAgentConvertToOutputFormat(this: FieldCsvAgentContext, aggregatedFields: AggregatedField[], mapping: FieldColumnMapping): FieldRecord[] {
    return aggregatedFields.map((field, i) => {
      // Convert surface from HA to MQ
      const superficieCatastaleMq =
        field.superficieCatastaleHa !== null
          ? Math.round(field.superficieCatastaleHa * 10000)
          : null;

      const cityName = field.comune || 'Unknown';
      const displayName = field.comune || field.unitaProduttiva || cityName;
      const name =
        field.foglio && field.particella
          ? `${displayName} - F${field.foglio} P${field.particella}`
          : `${displayName} - Campo ${i + 1}`;

      // Convert dates
      const inizioConduzione = field.dateInizio[0]
        ? this.convertDate(field.dateInizio[0], mapping.dateFormat)
        : null;
      const fineConduzione = field.dateFine[0]
        ? this.convertDate(field.dateFine[0], mapping.dateFormat)
        : null;

      // Combine usi suolo (exclude non-agricultural uses)
      const uso =
        field.usiSuolo
          .filter((u: string) => u && !u.includes('FABBRICATI') && !u.includes('NON AGRICOLO'))
          .join(', ') || null;

      // Address should NOT be taken from unitaProduttiva if it contains crop names
      // Only use it if it looks like an address (contains " - " with 3 parts: CODE - CITY - ADDRESS)
      let address: string | null = field.indirizzo || null;
      if (!address && field.unitaProduttiva) {
        const parts = field.unitaProduttiva.split(' - ').filter((p) => p.trim().length > 0);
        // If unitaProduttiva has format "CODE - CITY - ADDRESS", use the address part
        if (parts.length >= 3) {
          address = parts.slice(2).join(' - ');
        }
        // Otherwise, don't use unitaProduttiva as address (it might be a crop name)
      }

      return {
        name,
        nation: 'IT',
        region: field.regione,
        city: cityName,
        address,
        cap: field.cap,
        foglio: field.foglio,
        particella: field.particella,
        subalterno: field.subalterno,
        sezione: field.sezione,
        superficieCatastaleMq,
        gisHa: field.superficieGraficaHa,
        sauHa: field.sauHa,
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
  }

import { type ParsedRow } from './utils/csv_parser';
import { FieldColumnMapping } from './field_csv_agent.support';
import type { FieldCsvAgentContext } from './field-csv-agent.context';

export function fieldCsvAgentAdjustAreaUnitBySample(this: FieldCsvAgentContext, rows: ParsedRow[], mapping: FieldColumnMapping): FieldColumnMapping {
    const areaColumnName = mapping.columns.superficieCatastale;
    if (!areaColumnName) {
      return mapping;
    }
    const samples: number[] = [];
    for (let i = 0; i < rows.length && samples.length < 50; i++) {
      const raw = this.getValue(rows[i], areaColumnName);
      const parsed = this.parseNumber(raw);
      if (parsed !== null) {
        samples.push(parsed);
      }
    }
    if (samples.length < 5) {
      return mapping;
    }
    const max = Math.max(...samples);
    const min = Math.min(...samples);
    const looksLikeHectares = max > 0 && max < 200;
    const looksLikeSquareMeters = max >= 1000 || min >= 100;

    if (looksLikeHectares && mapping.superficieUnit === 'MQ') {
      return { ...mapping, superficieUnit: 'HA' };
    }
    if (looksLikeSquareMeters && mapping.superficieUnit === 'HA') {
      return { ...mapping, superficieUnit: 'MQ' };
    }
    if (mapping.superficieUnit === 'UNKNOWN' && (looksLikeHectares || looksLikeSquareMeters)) {
      return { ...mapping, superficieUnit: looksLikeSquareMeters ? 'MQ' : 'HA' };
    }
    return mapping;
  }

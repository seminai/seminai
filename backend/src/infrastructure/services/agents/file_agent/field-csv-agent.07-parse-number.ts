import { parseNumber as sharedParseNumber } from './utils/csv_parser';
import type { FieldCsvAgentContext } from './field-csv-agent.context';

export function fieldCsvAgentParseNumber(this: FieldCsvAgentContext, value: string): number | null {
    return sharedParseNumber(value);
  }

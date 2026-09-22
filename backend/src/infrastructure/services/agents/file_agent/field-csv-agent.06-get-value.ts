import { type ParsedRow, getValue as sharedGetValue } from './utils/csv_parser';
import type { FieldCsvAgentContext } from './field-csv-agent.context';

export function fieldCsvAgentGetValue(this: FieldCsvAgentContext, row: ParsedRow, columnName: string | null): string {
    return sharedGetValue(row, columnName) ?? '';
  }

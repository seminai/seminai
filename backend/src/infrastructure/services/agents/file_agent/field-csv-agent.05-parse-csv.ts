import { type ParsedRow, parseCsv as sharedParseCsv } from './utils/csv_parser';
import type { FieldCsvAgentContext } from './field-csv-agent.context';

export function fieldCsvAgentParseCsv(this: FieldCsvAgentContext, content: string): { headers: string[]; rows: ParsedRow[] } {
    return sharedParseCsv(content);
  }

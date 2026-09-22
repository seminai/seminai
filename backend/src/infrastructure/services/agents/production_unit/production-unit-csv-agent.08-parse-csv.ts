import { type ParsedRow, parseCsv as sharedParseCsv } from '../file_agent/utils/csv_parser';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export function productionUnitCsvAgentParseCsv(this: ProductionUnitCsvAgentContext, content: string): { headers: string[]; rows: ParsedRow[] } {
    return sharedParseCsv(content);
  }

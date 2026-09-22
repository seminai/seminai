import { type ParsedRow, getValue as sharedGetValue } from '../file_agent/utils/csv_parser';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export function productionUnitCsvAgentGetValue(this: ProductionUnitCsvAgentContext, row: ParsedRow, colName: string | null): string | null {
    return sharedGetValue(row, colName);
  }

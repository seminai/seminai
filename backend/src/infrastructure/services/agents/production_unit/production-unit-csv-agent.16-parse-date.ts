import { parseDate as sharedParseDate } from '../file_agent/utils/csv_parser';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export function productionUnitCsvAgentParseDate(this: ProductionUnitCsvAgentContext, value: string | null): string | null {
    return sharedParseDate(value);
  }

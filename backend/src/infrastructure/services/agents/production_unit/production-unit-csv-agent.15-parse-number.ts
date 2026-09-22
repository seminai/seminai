import { parseNumber as sharedParseNumber } from '../file_agent/utils/csv_parser';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export function productionUnitCsvAgentParseNumber(this: ProductionUnitCsvAgentContext, value: string | null): number | null {
    return sharedParseNumber(value);
  }

import { normalizeString as sharedNormalizeString } from '../file_agent/utils/csv_parser';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export function productionUnitCsvAgentNormalizeString(this: ProductionUnitCsvAgentContext, value: string): string {
    return sharedNormalizeString(value);
  }

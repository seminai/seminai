import { parseOccupazione as sharedParseOccupazione } from '../file_agent/utils/csv_parser';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export function productionUnitCsvAgentParseOccupazione(this: ProductionUnitCsvAgentContext, value: string): { code: string | null; name: string | null } {
    return sharedParseOccupazione(value);
  }

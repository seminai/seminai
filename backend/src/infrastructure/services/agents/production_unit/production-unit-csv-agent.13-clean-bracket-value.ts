import { cleanBracketValue as sharedCleanBracketValue } from '../file_agent/utils/csv_parser';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export function productionUnitCsvAgentCleanBracketValue(this: ProductionUnitCsvAgentContext, value: string | null): string | null {
    return sharedCleanBracketValue(value);
  }

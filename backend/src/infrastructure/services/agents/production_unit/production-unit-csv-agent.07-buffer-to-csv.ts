import { bufferToCsv } from '../file_agent/utils/csv_parser';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export function productionUnitCsvAgentBufferToCsv(this: ProductionUnitCsvAgentContext, buffer: Buffer): string {
    return bufferToCsv(buffer);
  }

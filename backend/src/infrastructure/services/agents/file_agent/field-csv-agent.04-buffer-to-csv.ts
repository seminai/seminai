import { bufferToCsv } from './utils/csv_parser';
import type { FieldCsvAgentContext } from './field-csv-agent.context';

export function fieldCsvAgentBufferToCsv(this: FieldCsvAgentContext, buffer: Buffer): string {
    return bufferToCsv(buffer);
  }

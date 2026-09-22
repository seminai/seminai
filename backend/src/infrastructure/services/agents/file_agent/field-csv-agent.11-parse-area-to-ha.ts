import type { FieldCsvAgentContext } from './field-csv-agent.context';

export function fieldCsvAgentParseAreaToHa(this: FieldCsvAgentContext, value: string, unit: 'HA' | 'MQ' | 'UNKNOWN'): number | null {
    const parsed = this.parseNumber(value);
    if (parsed === null) return null;

    if (unit === 'MQ') {
      return parsed / 10000; // Convert MQ to HA
    }
    return parsed; // Already in HA or unknown (assume HA)
  }

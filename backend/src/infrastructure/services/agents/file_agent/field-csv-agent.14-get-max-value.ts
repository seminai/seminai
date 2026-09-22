import type { FieldCsvAgentContext } from './field-csv-agent.context';

export function fieldCsvAgentGetMaxValue(this: FieldCsvAgentContext, current: number | null, candidate: number | null): number | null {
    if (current === null && candidate === null) {
      return null;
    }
    if (current === null) {
      return candidate;
    }
    if (candidate === null) {
      return current;
    }
    return Math.max(current, candidate);
  }

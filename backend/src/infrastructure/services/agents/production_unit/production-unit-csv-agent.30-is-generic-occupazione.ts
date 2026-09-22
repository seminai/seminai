import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export function productionUnitCsvAgentIsGenericOccupazione(this: ProductionUnitCsvAgentContext, value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return (
      normalized.includes('coltura principale') ||
      normalized.includes('coltura secondaria') ||
      normalized.includes('coltura secondarie')
    );
  }

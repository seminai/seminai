import { type ParsedRow } from './utils/csv_parser';
import { FieldColumnMapping } from './field_csv_agent.support';
import type { FieldCsvAgentContext } from './field-csv-agent.context';

export function fieldCsvAgentExtractRowsWithMapping(this: FieldCsvAgentContext, rows: ParsedRow[], mapping: FieldColumnMapping): ParsedRow[] {
    const cols = mapping.columns;

    // Validate required columns exist
    if (!cols.foglio || !cols.particella) {
      throw new Error('Colonne obbligatorie (Foglio, Particella) non trovate nel CSV');
    }

    // Filter rows with valid foglio/particella
    return rows.filter((row) => {
      const foglio = this.getValue(row, cols.foglio);
      const particella = this.getValue(row, cols.particella);
      return foglio && particella && foglio.length > 0 && particella.length > 0;
    });
  }

import type { FieldCsvAgentContext } from './field-csv-agent.context';

export function fieldCsvAgentConvertDate(this: FieldCsvAgentContext, dateStr: string, format: 'DD/MM/YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD' | 'UNKNOWN'): string | null {
    if (!dateStr) return null;

    // Handle timestamp format: "2025-01-01 00:00:00.0" -> extract date part
    const timestampMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    if (timestampMatch) {
      return timestampMatch[1]; // Return YYYY-MM-DD part
    }

    if (format === 'YYYY-MM-DD') {
      // Extract just the date part if there's extra content
      const dateOnly = dateStr.split(' ')[0];
      if (dateOnly.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateOnly;
      }
      return dateStr; // Already in correct format
    }

    // Split by common separators
    const parts = dateStr.split(/[\/\-\.]/);
    if (parts.length === 3) {
      // DD/MM/YYYY or DD-MM-YYYY format
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2].split(' ')[0]; // Take only year part if there's extra content

      // Validate
      if (year.length === 4) {
        return `${year}-${month}-${day}`;
      }
    }

    return null;
  }

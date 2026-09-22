import type { CompanyDataExtractorAgentContext } from './company-data-extractor-agent.context';

export function companyDataExtractorAgentParseCsvLine(this: CompanyDataExtractorAgentContext, line: string, separator: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    while (i < line.length) {
      const char = line[i];
      const nextChar = line[i + 1];
      if (char === '"') {
        if (!inQuotes) {
          inQuotes = true;
        } else if (nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else if (char === separator && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
      i++;
    }
    result.push(current.trim());
    return result;
  }

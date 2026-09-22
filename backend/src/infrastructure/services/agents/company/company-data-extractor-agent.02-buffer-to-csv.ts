import * as XLSX from 'xlsx';
import type { CompanyDataExtractorAgentContext } from './company-data-extractor-agent.context';

export function companyDataExtractorAgentBufferToCsv(this: CompanyDataExtractorAgentContext, buffer: Buffer): string {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (firstSheet) {
        return XLSX.utils.sheet_to_csv(firstSheet, { FS: ';' });
      }
    } catch {
      // Not an Excel file, treat as CSV
    }

    let content = buffer.toString('utf-8');
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return content;
  }

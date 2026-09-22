import type { CompanyDataExtractorAgentContext } from './company-data-extractor-agent.context';

export function companyDataExtractorAgentDetectSeparator(this: CompanyDataExtractorAgentContext, line: string): string {
    const separators = [';', ',', '\t', '|'];
    const counts = separators.map((sep) => ({
      sep,
      count: (line.match(new RegExp(sep.replace(/[|]/g, '\\$&'), 'g')) || []).length,
    }));
    counts.sort((a, b) => b.count - a.count);
    return counts[0]?.sep ?? ';';
  }

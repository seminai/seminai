import type { TableAwareTextSplitterContext } from './table-aware-text-splitter.context';

export function tableAwareTextSplitterIsSectionHeader(this: TableAwareTextSplitterContext, line: string): boolean {
    // Markdown headers
    if (line.match(/^#+\s/)) return true;

    // ALL CAPS headers (common in disciplinari)
    if (
      line.length > 3 &&
      line.length < 100 &&
      line === line.toUpperCase() &&
      line.match(/[A-Z]/)
    ) {
      return true;
    }

    // Headers with keywords
    const keywords = ['DIFESA', 'DISERBO', 'CRITTOGAME', 'FITOFAGI', 'VITE', 'AVVERSITA'];
    if (keywords.some((kw) => line.toUpperCase().includes(kw))) {
      return true;
    }

    return false;
  }

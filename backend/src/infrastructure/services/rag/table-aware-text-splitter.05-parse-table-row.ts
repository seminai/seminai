import type { TableAwareTextSplitterContext } from './table-aware-text-splitter.context';

export function tableAwareTextSplitterParseTableRow(this: TableAwareTextSplitterContext, line: string): string[] {
    return line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
  }

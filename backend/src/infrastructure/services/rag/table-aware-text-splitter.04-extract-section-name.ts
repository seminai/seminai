import type { TableAwareTextSplitterContext } from './table-aware-text-splitter.context';

export function tableAwareTextSplitterExtractSectionName(this: TableAwareTextSplitterContext, line: string): string {
    return line.replace(/^#+\s*/, '').trim();
  }

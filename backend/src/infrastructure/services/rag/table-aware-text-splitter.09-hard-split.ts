import type { TableAwareTextSplitterContext } from './table-aware-text-splitter.context';

export function tableAwareTextSplitterHardSplit(this: TableAwareTextSplitterContext, text: string): string[] {
    const chunks: string[] = [];
    const size = this.config.maxTextChunkSize;

    for (let i = 0; i < text.length; i += size - this.config.overlap) {
      chunks.push(text.slice(i, i + size));
    }

    return chunks;
  }

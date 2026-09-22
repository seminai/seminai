import type { TableAwareTextSplitterContext } from './table-aware-text-splitter.context';

export function tableAwareTextSplitterAddOverlap(this: TableAwareTextSplitterContext, chunks: string[]): string[] {
    if (chunks.length <= 1 || this.config.overlap === 0) {
      return chunks;
    }

    const overlappedChunks: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];

      // Add end of previous chunk as prefix
      if (i > 0) {
        const prevChunk = chunks[i - 1];
        const overlapText = prevChunk.slice(-this.config.overlap);
        chunk = overlapText + chunk;
      }

      overlappedChunks.push(chunk);
    }

    return overlappedChunks;
  }

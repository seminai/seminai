import { TableAwareChunk, TextSegment } from './table-aware-text-splitter.support';
import type { TableAwareTextSplitterContext } from './table-aware-text-splitter.context';

export function tableAwareTextSplitterSplitTextSegment(this: TableAwareTextSplitterContext, segment: TextSegment, startIndex: number): TableAwareChunk[] {
    const chunks: TableAwareChunk[] = [];
    const text = segment.content.trim();

    if (text.length <= this.config.maxTextChunkSize) {
      // No splitting needed
      chunks.push({
        content: text,
        metadata: {
          type: 'text',
          sectionName: segment.sectionName,
          chunkIndex: startIndex,
        },
      });
      return chunks;
    }

    // Split recursively using separators
    const splitChunks = this.recursiveSplit(text, this.config.separators);

    for (let i = 0; i < splitChunks.length; i++) {
      chunks.push({
        content: splitChunks[i],
        metadata: {
          type: 'text',
          sectionName: segment.sectionName,
          chunkIndex: startIndex + i,
        },
      });
    }

    return chunks;
  }

import { TableAwareChunk } from './table-aware-text-splitter.support';
import type { TableAwareTextSplitterContext } from './table-aware-text-splitter.context';

export async function tableAwareTextSplitterSplitText(this: TableAwareTextSplitterContext, text: string): Promise<TableAwareChunk[]> {
    // 1. Identify segments (tables vs text blocks)
    const segments = this.identifySegments(text);
    console.log(`[TABLE_SPLITTER] Identified ${segments.length} segments`);

    // 2. Split each segment appropriately
    const chunks: TableAwareChunk[] = [];
    let chunkIndex = 0;

    for (const segment of segments) {
      if (segment.type === 'table') {
        const tableChunks = this.splitTableSegment(segment, chunkIndex);
        chunks.push(...tableChunks);
        chunkIndex += tableChunks.length;
      } else {
        const textChunks = this.splitTextSegment(segment, chunkIndex);
        chunks.push(...textChunks);
        chunkIndex += textChunks.length;
      }
    }

    console.log(`[TABLE_SPLITTER] Created ${chunks.length} chunks`);
    return chunks;
  }

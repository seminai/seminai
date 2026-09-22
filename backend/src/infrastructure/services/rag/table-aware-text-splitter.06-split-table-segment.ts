import { TableAwareChunk, TextSegment } from './table-aware-text-splitter.support';
import type { TableAwareTextSplitterContext } from './table-aware-text-splitter.context';

export function tableAwareTextSplitterSplitTableSegment(this: TableAwareTextSplitterContext, segment: TextSegment, startIndex: number): TableAwareChunk[] {
    const chunks: TableAwareChunk[] = [];
    const lines = segment.content.split('\n').filter((l) => l.trim());

    // Find header and separator lines
    let headerLines: string[] = [];
    let dataLines: string[] = [];
    let headerEndIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^\|[-:\s|]+\|$/)) {
        // This is a separator line - everything before it is header
        headerEndIndex = i + 1;
        headerLines = lines.slice(0, headerEndIndex);
        dataLines = lines.slice(headerEndIndex);
        break;
      }
    }

    // If no separator found, first line is header
    if (headerLines.length === 0) {
      headerLines = [lines[0]];
      dataLines = lines.slice(1);
    }

    const headerText = headerLines.join('\n');
    const maxDataSize = this.config.maxTableChunkSize - headerText.length - 100; // Buffer

    // Group data lines into chunks
    let currentChunkLines: string[] = [];
    let currentChunkSize = 0;

    for (const line of dataLines) {
      if (currentChunkSize + line.length > maxDataSize && currentChunkLines.length > 0) {
        // Create chunk with header
        const chunkContent = headerText + '\n' + currentChunkLines.join('\n');
        chunks.push({
          content: chunkContent,
          metadata: {
            type: 'table',
            tableHeaders: segment.headers,
            sectionName: segment.sectionName,
            chunkIndex: startIndex + chunks.length,
          },
        });
        currentChunkLines = [];
        currentChunkSize = 0;
      }
      currentChunkLines.push(line);
      currentChunkSize += line.length + 1;
    }

    // Add remaining lines
    if (currentChunkLines.length > 0) {
      const chunkContent = headerText + '\n' + currentChunkLines.join('\n');
      chunks.push({
        content: chunkContent,
        metadata: {
          type: 'table',
          tableHeaders: segment.headers,
          sectionName: segment.sectionName,
          chunkIndex: startIndex + chunks.length,
        },
      });
    }

    // If no chunks created (table smaller than max size), create one chunk
    if (chunks.length === 0) {
      chunks.push({
        content: segment.content.trim(),
        metadata: {
          type: 'table',
          tableHeaders: segment.headers,
          sectionName: segment.sectionName,
          chunkIndex: startIndex,
        },
      });
    }

    return chunks;
  }

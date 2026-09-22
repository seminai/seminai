/**
 * Table-aware text splitter for disciplinari PDFs.
 * Preserves table structure during chunking by:
 * - Detecting table boundaries (Markdown format)
 * - Never splitting tables mid-row
 * - Including table headers with each chunk
 * - Using larger chunk sizes for tabular data
 */

/**
 * Chunk with metadata
 */
export interface TableAwareChunk {
  content: string;
  metadata: {
    type: 'table' | 'text';
    tableHeaders?: string[];
    sectionName?: string;
    pageNumber?: number;
    chunkIndex: number;
  };
}

/**
 * Segment representing either a table or text block
 */
interface TextSegment {
  type: 'table' | 'text';
  content: string;
  headers?: string[];
  sectionName?: string;
}

/**
 * Configuration for table-aware splitting
 */
export interface TableAwareSplitterConfig {
  /**
   * Maximum chunk size for table segments (default: 4000)
   */
  maxTableChunkSize: number;

  /**
   * Maximum chunk size for text segments (default: 1500)
   */
  maxTextChunkSize: number;

  /**
   * Overlap between chunks (default: 300)
   */
  overlap: number;

  /**
   * Separators for text splitting (priority order)
   */
  separators: string[];
}

const DEFAULT_CONFIG: TableAwareSplitterConfig = {
  maxTableChunkSize: 4000,
  maxTextChunkSize: 1500,
  overlap: 300,
  separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ': ', ' '],
};

/**
 * Table-aware text splitter that preserves table structure
 */
export class TableAwareTextSplitter {
  private config: TableAwareSplitterConfig;

  constructor(config: Partial<TableAwareSplitterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Split text into chunks while preserving table structure
   */
  async splitText(text: string): Promise<TableAwareChunk[]> {
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

  /**
   * Identify table and text segments in the document
   */
  private identifySegments(text: string): TextSegment[] {
    const segments: TextSegment[] = [];
    const lines = text.split('\n');

    let currentSegment: TextSegment | null = null;
    let currentTableHeaders: string[] | undefined;
    let currentSectionName: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Check for section headers
      if (this.isSectionHeader(trimmedLine)) {
        currentSectionName = this.extractSectionName(trimmedLine);
      }

      // Check if line is part of a table
      const isTableLine = trimmedLine.startsWith('|') && trimmedLine.endsWith('|');
      const isSeparatorLine = isTableLine && trimmedLine.match(/^\|[-:\s|]+\|$/);

      if (isTableLine && !isSeparatorLine) {
        // This is a table row
        if (!currentSegment || currentSegment.type !== 'table') {
          // Start new table segment
          if (currentSegment) {
            segments.push(currentSegment);
          }
          currentTableHeaders = this.parseTableRow(trimmedLine);
          currentSegment = {
            type: 'table',
            content: line + '\n',
            headers: currentTableHeaders,
            sectionName: currentSectionName,
          };
        } else {
          // Continue table segment
          currentSegment.content += line + '\n';
        }
      } else if (isSeparatorLine && currentSegment?.type === 'table') {
        // Keep separator line with table
        currentSegment.content += line + '\n';
      } else {
        // This is text (not a table)
        if (!currentSegment || currentSegment.type !== 'text') {
          // Start new text segment
          if (currentSegment) {
            segments.push(currentSegment);
          }
          currentSegment = {
            type: 'text',
            content: line + '\n',
            sectionName: currentSectionName,
          };
        } else {
          // Continue text segment
          currentSegment.content += line + '\n';
        }
      }
    }

    // Add final segment
    if (currentSegment && currentSegment.content.trim()) {
      segments.push(currentSegment);
    }

    return segments;
  }

  /**
   * Check if a line is a section header
   */
  private isSectionHeader(line: string): boolean {
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

  /**
   * Extract section name from header line
   */
  private extractSectionName(line: string): string {
    return line.replace(/^#+\s*/, '').trim();
  }

  /**
   * Parse a table row into cells
   */
  private parseTableRow(line: string): string[] {
    return line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
  }

  /**
   * Split a table segment into chunks
   */
  private splitTableSegment(segment: TextSegment, startIndex: number): TableAwareChunk[] {
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

  /**
   * Split a text segment into chunks using recursive character splitting
   */
  private splitTextSegment(segment: TextSegment, startIndex: number): TableAwareChunk[] {
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

  /**
   * Recursively split text using separator hierarchy
   */
  private recursiveSplit(text: string, separators: string[]): string[] {
    if (text.length <= this.config.maxTextChunkSize) {
      return [text];
    }

    if (separators.length === 0) {
      // Last resort: hard split
      return this.hardSplit(text);
    }

    const separator = separators[0];
    const parts = text.split(separator);

    // Try to combine parts into chunks
    const chunks: string[] = [];
    let currentChunk = '';

    for (const part of parts) {
      const newChunk = currentChunk ? currentChunk + separator + part : part;

      if (newChunk.length <= this.config.maxTextChunkSize) {
        currentChunk = newChunk;
      } else {
        // Current part would make chunk too big
        if (currentChunk) {
          chunks.push(currentChunk);
        }

        // Check if part itself is too big
        if (part.length > this.config.maxTextChunkSize) {
          // Recursively split with remaining separators
          const subChunks = this.recursiveSplit(part, separators.slice(1));
          chunks.push(...subChunks);
          currentChunk = '';
        } else {
          currentChunk = part;
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    // Add overlap
    return this.addOverlap(chunks);
  }

  /**
   * Hard split text at character boundaries
   */
  private hardSplit(text: string): string[] {
    const chunks: string[] = [];
    const size = this.config.maxTextChunkSize;

    for (let i = 0; i < text.length; i += size - this.config.overlap) {
      chunks.push(text.slice(i, i + size));
    }

    return chunks;
  }

  /**
   * Add overlap between chunks
   */
  private addOverlap(chunks: string[]): string[] {
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
}

/**
 * Create a table-aware text splitter with default configuration
 */
export function createTableAwareTextSplitter(
  config: Partial<TableAwareSplitterConfig> = {},
): TableAwareTextSplitter {
  return new TableAwareTextSplitter(config);
}

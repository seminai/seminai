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
export interface TextSegment {
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


export const DEFAULT_CONFIG: TableAwareSplitterConfig = {
  maxTableChunkSize: 4000,
  maxTextChunkSize: 1500,
  overlap: 300,
  separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ': ', ' '],
};

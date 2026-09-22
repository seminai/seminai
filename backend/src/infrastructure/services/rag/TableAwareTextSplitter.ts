import { TableAwareChunk, TextSegment, TableAwareSplitterConfig, DEFAULT_CONFIG } from './table-aware-text-splitter.support';
import type { TableAwareTextSplitterContext } from './table-aware-text-splitter.context';
import { tableAwareTextSplitterSplitText } from './table-aware-text-splitter.01-split-text';
import { tableAwareTextSplitterIdentifySegments } from './table-aware-text-splitter.02-identify-segments';
import { tableAwareTextSplitterIsSectionHeader } from './table-aware-text-splitter.03-is-section-header';
import { tableAwareTextSplitterExtractSectionName } from './table-aware-text-splitter.04-extract-section-name';
import { tableAwareTextSplitterParseTableRow } from './table-aware-text-splitter.05-parse-table-row';
import { tableAwareTextSplitterSplitTableSegment } from './table-aware-text-splitter.06-split-table-segment';
import { tableAwareTextSplitterSplitTextSegment } from './table-aware-text-splitter.07-split-text-segment';
import { tableAwareTextSplitterRecursiveSplit } from './table-aware-text-splitter.08-recursive-split';
import { tableAwareTextSplitterHardSplit } from './table-aware-text-splitter.09-hard-split';
import { tableAwareTextSplitterAddOverlap } from './table-aware-text-splitter.10-add-overlap';

export { type TableAwareChunk, type TableAwareSplitterConfig } from './table-aware-text-splitter.support';

/**
 * Table-aware text splitter that preserves table structure
 */
export class TableAwareTextSplitter {

  config: TableAwareSplitterConfig;

  constructor(config: Partial<TableAwareSplitterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Split text into chunks while preserving table structure
   */
  async splitText(text: string): Promise<TableAwareChunk[]> {
    return tableAwareTextSplitterSplitText.call(this as unknown as TableAwareTextSplitterContext, text);
  }

  /**
   * Identify table and text segments in the document
   */
  identifySegments(text: string): TextSegment[] {
    return tableAwareTextSplitterIdentifySegments.call(this as unknown as TableAwareTextSplitterContext, text);
  }

  /**
   * Check if a line is a section header
   */
  isSectionHeader(line: string): boolean {
    return tableAwareTextSplitterIsSectionHeader.call(this as unknown as TableAwareTextSplitterContext, line);
  }

  /**
   * Extract section name from header line
   */
  extractSectionName(line: string): string {
    return tableAwareTextSplitterExtractSectionName.call(this as unknown as TableAwareTextSplitterContext, line);
  }

  /**
   * Parse a table row into cells
   */
  parseTableRow(line: string): string[] {
    return tableAwareTextSplitterParseTableRow.call(this as unknown as TableAwareTextSplitterContext, line);
  }

  /**
   * Split a table segment into chunks
   */
  splitTableSegment(segment: TextSegment, startIndex: number): TableAwareChunk[] {
    return tableAwareTextSplitterSplitTableSegment.call(this as unknown as TableAwareTextSplitterContext, segment, startIndex);
  }

  /**
   * Split a text segment into chunks using recursive character splitting
   */
  splitTextSegment(segment: TextSegment, startIndex: number): TableAwareChunk[] {
    return tableAwareTextSplitterSplitTextSegment.call(this as unknown as TableAwareTextSplitterContext, segment, startIndex);
  }

  /**
   * Recursively split text using separator hierarchy
   */
  recursiveSplit(text: string, separators: string[]): string[] {
    return tableAwareTextSplitterRecursiveSplit.call(this as unknown as TableAwareTextSplitterContext, text, separators);
  }

  /**
   * Hard split text at character boundaries
   */
  hardSplit(text: string): string[] {
    return tableAwareTextSplitterHardSplit.call(this as unknown as TableAwareTextSplitterContext, text);
  }

  /**
   * Add overlap between chunks
   */
  addOverlap(chunks: string[]): string[] {
    return tableAwareTextSplitterAddOverlap.call(this as unknown as TableAwareTextSplitterContext, chunks);
  }
}

export function createTableAwareTextSplitter(
  config: Partial<TableAwareSplitterConfig> = {},
): TableAwareTextSplitter {
  return new TableAwareTextSplitter(config);
}

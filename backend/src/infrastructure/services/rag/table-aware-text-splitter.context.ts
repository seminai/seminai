import { TableAwareChunk, TextSegment, TableAwareSplitterConfig } from './table-aware-text-splitter.support';

export interface TableAwareTextSplitterContext {
  config: TableAwareSplitterConfig;
  splitText(text: string): Promise<TableAwareChunk[]>;
  identifySegments(text: string): TextSegment[];
  isSectionHeader(line: string): boolean;
  extractSectionName(line: string): string;
  parseTableRow(line: string): string[];
  splitTableSegment(segment: TextSegment, startIndex: number): TableAwareChunk[];
  splitTextSegment(segment: TextSegment, startIndex: number): TableAwareChunk[];
  recursiveSplit(text: string, separators: string[]): string[];
  hardSplit(text: string): string[];
  addOverlap(chunks: string[]): string[];
}

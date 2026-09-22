import { TextSegment } from './table-aware-text-splitter.support';
import type { TableAwareTextSplitterContext } from './table-aware-text-splitter.context';

export function tableAwareTextSplitterIdentifySegments(this: TableAwareTextSplitterContext, text: string): TextSegment[] {
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

import type { TableAwareTextSplitterContext } from './table-aware-text-splitter.context';

export function tableAwareTextSplitterRecursiveSplit(this: TableAwareTextSplitterContext, text: string, separators: string[]): string[] {
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

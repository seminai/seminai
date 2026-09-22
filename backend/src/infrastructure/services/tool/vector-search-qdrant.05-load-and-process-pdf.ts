import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { convertPdfToTextWithPositionalAnaylsis } from '../ocr/pdfToText';
import type { VectorSearchQdrantServiceContext } from './vector-search-qdrant.context';

export async function vectorSearchQdrantServiceLoadAndProcessPdf(this: VectorSearchQdrantServiceContext, pdfPath: string, sourceName: string, sourceType: 'buffer' | 'url'): Promise<Document[]> {
    console.log(`[VectorSearchQdrant] Loading PDF: ${sourceName}`);
    const { text } = await convertPdfToTextWithPositionalAnaylsis(pdfPath);
    if (!text || text.trim().length === 0) {
      console.warn(`[VectorSearchQdrant] No text extracted from ${sourceName}`);
      return [];
    }
    console.log(`[VectorSearchQdrant] Extracted ${text.length} characters from ${sourceName}`);
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap,
      separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ': ', ' ', ''],
      keepSeparator: true,
    });
    const chunks = await textSplitter.splitText(text);
    console.log(`[VectorSearchQdrant] Created ${chunks.length} chunks`);
    const documents: Document[] = chunks.map((chunk, index) => ({
      pageContent: chunk,
      metadata: {
        source: sourceName,
        chunkIndex: index,
        sourceType,
        createdAt: new Date().toISOString(),
      },
    }));
    return documents;
  }

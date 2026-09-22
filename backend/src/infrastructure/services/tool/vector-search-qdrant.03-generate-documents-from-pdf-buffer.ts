import { Document } from '@langchain/core/documents';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { VectorSearchQdrantServiceContext } from './vector-search-qdrant.context';

export async function vectorSearchQdrantServiceGenerateDocumentsFromPdfBuffer(this: VectorSearchQdrantServiceContext, pdfBuffer: Buffer, sourceName: string): Promise<Document[]> {
    const tempFilePath = path.join(os.tmpdir(), `temp-pdf-${Date.now()}.pdf`);
    try {
      const view = new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);
      fs.writeFileSync(tempFilePath, view);
      const documents = await this.loadAndProcessPdf(tempFilePath, sourceName, 'buffer');
      return documents;
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }

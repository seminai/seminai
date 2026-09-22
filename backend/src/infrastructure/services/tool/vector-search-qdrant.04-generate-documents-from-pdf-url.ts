import { Document } from '@langchain/core/documents';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { VectorSearchQdrantServiceContext } from './vector-search-qdrant.context';

export async function vectorSearchQdrantServiceGenerateDocumentsFromPdfUrl(this: VectorSearchQdrantServiceContext, pdfUrl: string): Promise<Document[]> {
    const tempFilePath = path.join(os.tmpdir(), `temp-pdf-url-${Date.now()}.pdf`);
    try {
      console.log(`[VectorSearchQdrant] Downloading PDF from ${pdfUrl}`);
      const response = await axios.get<ArrayBuffer>(pdfUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: {
          Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
        },
      });
      if (response.status < 200 || response.status >= 300 || !response.data) {
        throw new Error(`Failed to download PDF: HTTP ${response.status}`);
      }
      const buffer = Buffer.from(response.data);
      const view = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      fs.writeFileSync(tempFilePath, view);
      const documents = await this.loadAndProcessPdf(tempFilePath, pdfUrl, 'url');
      return documents;
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }

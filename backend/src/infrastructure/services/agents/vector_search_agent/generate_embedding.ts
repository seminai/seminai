import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import fs from 'fs';
import path from 'path';
import { createEmbeddings } from '../../llm-embeddings-factory';

interface EmbeddingResult {
  content: string;
  embedding: number[];
  metadata: {
    source: string;
    pageNumber?: number;
    chunkIndex: number;
  };
}

const EMBEDDING_BATCH_SIZE = 1000;

/**
 * Genera embeddings da PDF scientifici nella cartella dataset_crop_phases.
 * Ottimizzato per testi scientifici con chunking appropriato per preservare il contesto.
 *
 * @returns Array di documenti con embedding e metadata
 */
export async function generateEmbeddingFromPdf(datasetPath: string): Promise<EmbeddingResult[]> {
  const pdfFiles = fs.readdirSync(datasetPath).filter((file) => file.endsWith('.pdf'));
  console.log(`Found ${pdfFiles.length} PDF files to process`);
  const allDocuments: Document[] = [];
  for (const pdfFile of pdfFiles) {
    const pdfPath = path.join(datasetPath, pdfFile);
    console.log(`Loading PDF: ${pdfFile}`);
    const loader = new PDFLoader(pdfPath, {
      splitPages: true,
    });
    const docs = await loader.load();
    allDocuments.push(...docs);
    console.log(`Loaded ${docs.length} pages from ${pdfFile}`);
  }
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1200,
    chunkOverlap: 250,
    separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ': ', ' ', ''],
    keepSeparator: true,
  });
  console.log('Splitting documents into chunks...');
  const splitDocs = await textSplitter.splitDocuments(allDocuments);
  console.log(`Created ${splitDocs.length} chunks from all documents`);
  const embeddings = createEmbeddings().embeddings;
  console.log('Generating embeddings...');
  const results: EmbeddingResult[] = [];
  for (let start = 0; start < splitDocs.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = splitDocs.slice(start, start + EMBEDDING_BATCH_SIZE);
    const batchEmbeddings = await embeddings.embedDocuments(batch.map((d) => d.pageContent));
    for (let i = 0; i < batch.length; i++) {
      const doc = batch[i];
      results.push({
        content: doc.pageContent,
        embedding: batchEmbeddings[i],
        metadata: {
          source: doc.metadata.source || 'unknown',
          pageNumber: doc.metadata.loc?.pageNumber,
          chunkIndex: start + i,
        },
      });
    }
    console.log(
      `Processed ${Math.min(start + EMBEDDING_BATCH_SIZE, splitDocs.length)}/${splitDocs.length} chunks`,
    );
  }
  console.log(`Successfully generated ${results.length} embeddings`);
  return results;
}

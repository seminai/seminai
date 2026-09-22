import path from 'path';
import dotenv from 'dotenv';
import { generateEmbeddingFromPdf } from './generate_embedding';
import { saveEmbeddingsToQdrant } from './qdrant';

const DATASET_PATH = path.join(process.cwd(), 'dataset', 'dataset_crop_phases');

async function executeVectorUpload(): Promise<void> {
  dotenv.config();
  const requiredEnv = ['QDRANT_URL'];
  const missing = requiredEnv.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('Generating embeddings from dataset...');
  const embedding = await generateEmbeddingFromPdf(DATASET_PATH);
  console.log(`Generated ${embedding.length} embeddings. Uploading to Qdrant...`);
  await saveEmbeddingsToQdrant({
    collectionName: 'crop_phases_scientific_docs',
    embeddings: embedding,
    vectorSize: 1536,
  });
  console.log('Upload completed.');
}

executeVectorUpload().catch((err) => {
  console.error('Vector upload failed:', err);
  process.exitCode = 1;
});

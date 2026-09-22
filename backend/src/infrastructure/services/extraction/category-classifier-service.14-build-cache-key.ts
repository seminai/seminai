import { createHash } from 'node:crypto';
import { LLM_PROMPT_VERSION } from './category-classifier.service.support';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export function categoryClassifierServiceBuildCacheKey(this: CategoryClassifierServiceContext, fileBuffer: Buffer, mimeType: string, fileName: string, pdfText?: string): string {
    const digest = createHash('sha256').update(new Uint8Array(fileBuffer)).digest('hex');
    const pdfDigest = pdfText
      ? createHash('sha1').update(pdfText.slice(0, 2000)).digest('hex')
      : 'no-text';
    return `${LLM_PROMPT_VERSION}:${digest}:${mimeType}:${fileName.toLowerCase()}:${pdfDigest}`;
  }

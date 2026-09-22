import { ILabelTextProvider } from '../../../domain/repositories/ILabelServices';
import { LabelTextResult } from '../../../domain/dtos/label.dto';
import axios from 'axios';
import { createHash } from 'crypto';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { convertPdfToTextWithPositionalAnaylsis } from '../ocr/pdfToText';
import { extractMarkdownWithMistralOCRFromUrl } from '../ocr/mistral';

function hashBuffer(buffer: Buffer): string {
  const view = new Uint8Array(buffer.buffer as ArrayBuffer, buffer.byteOffset, buffer.byteLength);
  return createHash('sha256').update(view).digest('hex');
}

/**
 * Provider that extracts text directly from a PDF URL without SIAN scraping.
 * The 'name' parameter is expected to be the PDF URL.
 */
export class GetLabelTextFromUrlProvider implements ILabelTextProvider {
  async getText(pdfUrl: string, _registrationNumber: string): Promise<LabelTextResult | null> {
    if (!pdfUrl || pdfUrl.trim().length === 0) return null;
    const tmpDir: string = os.tmpdir();
    const fileBase: string = `label_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`;
    const pdfPath: string = path.join(tmpDir, fileBase);

    try {
      const resp = await axios.get<ArrayBuffer>(pdfUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: { Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8' },
        validateStatus: () => true,
      });
      if (resp.status < 200 || resp.status >= 300 || !resp.data) return null;
      const buf = Buffer.from(resp.data);
      const sourcePdfHash = hashBuffer(buf);
      const view = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      fs.writeFileSync(pdfPath, view);
      console.log('=== ATTEMPTING MISTRAL EXTRACTION FROM URL ===');
      try {
        const mistralExtraction: string = await extractMarkdownWithMistralOCRFromUrl(pdfUrl);
        const trimmedMistral: string = (mistralExtraction || '').trim();
        console.log(`=== MISTRAL EXTRACTION OUTPUT (${trimmedMistral.length} chars) ===`);
        if (trimmedMistral.length >= 10) {
          console.log('✓ Using Mistral extraction');
          return {
            url: pdfUrl,
            text: trimmedMistral,
            usedMistralOcr: true,
            sourcePdfHash,
            rawTextHash: createHash('sha256').update(trimmedMistral).digest('hex'),
            officialSourceUrl: pdfUrl,
          };
        }
        console.log(
          `✗ Mistral extraction too short (${trimmedMistral.length} chars), falling back to pdfToText`,
        );
      } catch (mistralError) {
        console.log('=== MISTRAL EXTRACTION FAILED ===');
        console.log(mistralError);
        console.log('✗ Falling back to pdfToText extraction');
      }
      console.log('=== ATTEMPTING PDFTOTEXT EXTRACTION FROM URL ===');
      const { text } = await convertPdfToTextWithPositionalAnaylsis(pdfPath);
      const trimmedText: string = (text || '').trim();
      console.log(`=== PDFTOTEXT EXTRACTION OUTPUT (${trimmedText.length} chars) ===`);
      if (trimmedText.length > 0) {
        console.log('✓ Using pdfToText extraction');
        return {
          url: pdfUrl,
          text: trimmedText,
          sourcePdfHash,
          rawTextHash: createHash('sha256').update(trimmedText).digest('hex'),
          officialSourceUrl: pdfUrl,
        };
      }
      console.log('✗ No valid extraction available');
      return null;
    } catch (error) {
      console.error(error);
      return null;
    } finally {
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    }
  }
}

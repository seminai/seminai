import axios from 'axios';
import { createHash } from 'crypto';

import { LabelTextResult } from '../../../domain/dtos/label.dto';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { convertPdfToTextWithPositionalAnaylsis } from '../ocr/pdfToText';
import { extractMarkdownWithMistralOCRFromUrl } from '../ocr/mistral';
import { getLinkLabelSian } from '../scraper/getLinkLabelSian';
import { DosageAgentContext } from '../agents/dosage_agent/context';

function hashBuffer(buffer: Buffer): string {
  const view = new Uint8Array(buffer.buffer as ArrayBuffer, buffer.byteOffset, buffer.byteLength);
  return createHash('sha256').update(view).digest('hex');
}

/**
 * Evaluate if extracted text is likely unreadable due to OCR/encoding issues.
 */
// function isLikelyUnreadable(text: string): boolean {
//   const total: number = text.length;
//   if (total === 0) return true;
//   let nonPrintable: number = 0;
//   let letters: number = 0;
//   for (let i = 0; i < total; i++) {
//     const code: number = text.charCodeAt(i);
//     const isWhitespace: boolean = code === 9 || code === 10 || code === 13 || code === 32;
//     const isControl: boolean = code < 32 && !isWhitespace;
//     if (isControl) nonPrintable++;
//     const ch: string = text[i];
//     if (/^[A-Za-zÀ-ÖØ-öø-ÿ]$/.test(ch)) letters++;
//   }
//   const nonPrintableRatio: number = nonPrintable / total;
//   const letterRatio: number = letters / total;
//   if (total >= 200 && (nonPrintableRatio > 0.02 || letterRatio < 0.2)) return true;
//   if (total >= 50 && (nonPrintableRatio > 0.05 || letterRatio < 0.15)) return true;
//   return false;
// }

export const getLabelTextFromPdfUrl = async (
  name: string,
  regNumber: string,
  context?: DosageAgentContext,
): Promise<LabelTextResult | null> => {
  const labelData = await getLinkLabelSian({
    name,
    regNumber,
    userId: context?.userId || 'public',
    context,
  });
  // const labelData = await fillFitosanitariNameField({
  //   name,
  //   options: { headless: false, keepOpenMs: 0, devtools: false },
  // });
  // const wanted = normalizeReg(regNumber);
  // const candidate =
  //   labelData.items.find((item) => {
  //     const cur = normalizeReg(item.registrationNumber);
  //     return cur === wanted || cur.includes(wanted);
  //   }) || labelData.items[0];
  // if (!candidate) return null;
  const sourceUrl: string | undefined = labelData.url;
  if (!sourceUrl) return null;
  const tmpDir: string = os.tmpdir();
  const fileBase: string = `label_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`;
  const pdfPath: string = path.join(tmpDir, fileBase);

  try {
    const resp = await axios.get<ArrayBuffer>(sourceUrl, {
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
    console.log('=== ATTEMPTING MISTRAL EXTRACTION ===');
    try {
      const mistralExtraction: string = await extractMarkdownWithMistralOCRFromUrl(sourceUrl);
      const trimmedMistral: string = (mistralExtraction || '').trim();
      console.log(`=== MISTRAL EXTRACTION OUTPUT (${trimmedMistral.length} chars) ===`);
      console.log(trimmedMistral);
      console.log('=== END MISTRAL EXTRACTION ===');
      if (trimmedMistral.length >= 10) {
        console.log('✓ Using Mistral extraction');
        return {
          url: sourceUrl,
          text: trimmedMistral,
          usedMistralOcr: true,
          sourcePdfHash,
          rawTextHash: createHash('sha256').update(trimmedMistral).digest('hex'),
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
    console.log('=== ATTEMPTING PDFTTOTEXT EXTRACTION ===');
    const { text } = await convertPdfToTextWithPositionalAnaylsis(pdfPath);
    const trimmedText: string = (text || '').trim();
    console.log(`=== PDFTOTEXT EXTRACTION OUTPUT (${trimmedText.length} chars) ===`);
    if (trimmedText.length > 0) {
      console.log('✓ Using pdfToText extraction');
      return {
        url: sourceUrl,
        text: trimmedText,
        sourcePdfHash,
        rawTextHash: createHash('sha256').update(trimmedText).digest('hex'),
      };
    }
    console.log('✗ No valid extraction available');
    return null;
  } catch (error) {
    console.error(error);
    return null;
  }
};

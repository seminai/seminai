import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ParsedPdfResult } from '../../../domain/dtos/rule-rag.types';
import { extractMarkdownWithMistralOCRFromUrl } from './mistral';
import { convertPdfToTextWithPositionalAnaylsis } from './pdfToText';

/**
 * Minimum character count threshold to consider an extraction successful.
 */
const MIN_TEXT_LENGTH = 200;

/**
 * Quality score thresholds for extracted text.
 */
const HIGH_QUALITY_MIN_LENGTH = 2000;
const MEDIUM_QUALITY_MIN_LENGTH = 500;

/**
 * Service for parsing complex PDFs using a hybrid approach:
 * 1. Primary: Mistral OCR API (best for tables, mixed orientation, complex layouts)
 * 2. Fallback: Positional text analysis (for cases where OCR fails)
 * 3. Validation: Quality check on extraction output
 */
export class HybridPdfParserService {
  /**
   * Parses a complex PDF buffer using a hybrid strategy.
   * Attempts Mistral OCR first, then falls back to positional analysis.
   * @param buffer PDF file buffer
   * @param pdfUrl Optional URL of the PDF for Mistral OCR (preferred over buffer)
   * @returns Parsed text with quality metadata
   */
  public async parseComplexPdf(buffer: Buffer, pdfUrl?: string): Promise<ParsedPdfResult> {
    const mistralResult = await this.tryMistralOcr(buffer, pdfUrl);
    if (mistralResult && this.isQualityExtraction(mistralResult)) {
      const quality = this.assessQuality(mistralResult);
      return {
        text: mistralResult,
        metadata: {
          pageCount: this.estimatePageCount(mistralResult),
          quality,
          method: 'mistral_ocr',
        },
      };
    }
    console.log('[HybridPdfParser] Mistral OCR insufficient, falling back to positional analysis');
    const positionalResult = await this.tryPositionalAnalysis(buffer);
    if (positionalResult && this.isQualityExtraction(positionalResult)) {
      if (mistralResult && mistralResult.length > positionalResult.length) {
        return {
          text: mistralResult,
          metadata: {
            pageCount: this.estimatePageCount(mistralResult),
            quality: this.assessQuality(mistralResult),
            method: 'hybrid',
          },
        };
      }
      return {
        text: positionalResult,
        metadata: {
          pageCount: this.estimatePageCount(positionalResult),
          quality: this.assessQuality(positionalResult),
          method: 'positional_analysis',
        },
      };
    }
    const bestText = mistralResult || positionalResult || '';
    return {
      text: bestText,
      metadata: {
        pageCount: this.estimatePageCount(bestText),
        quality: 'low',
        method: mistralResult ? 'mistral_ocr' : 'positional_analysis',
      },
    };
  }

  /**
   * Attempts extraction via Mistral OCR API.
   */
  private async tryMistralOcr(_buffer: Buffer, pdfUrl?: string): Promise<string | null> {
    try {
      if (pdfUrl) {
        console.log('[HybridPdfParser] Attempting Mistral OCR from URL');
        const text = await extractMarkdownWithMistralOCRFromUrl(pdfUrl);
        return text || null;
      }
      console.log('[HybridPdfParser] No URL provided, skipping Mistral OCR URL path');
      return null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn(`[HybridPdfParser] Mistral OCR failed: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Attempts extraction via positional text analysis.
   */
  private async tryPositionalAnalysis(buffer: Buffer): Promise<string | null> {
    const tempFilePath = path.join(os.tmpdir(), `hybrid-pdf-${Date.now()}.pdf`);
    try {
      const view = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      fs.writeFileSync(tempFilePath, view);
      const result = await convertPdfToTextWithPositionalAnaylsis(tempFilePath);
      return result.text || null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn(`[HybridPdfParser] Positional analysis failed: ${errorMessage}`);
      return null;
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }

  /**
   * Checks if the extracted text meets minimum quality standards.
   */
  private isQualityExtraction(text: string): boolean {
    return text.trim().length >= MIN_TEXT_LENGTH;
  }

  /**
   * Assesses the quality of extracted text based on length and content characteristics.
   */
  private assessQuality(text: string): 'high' | 'medium' | 'low' {
    const trimmed = text.trim();
    if (trimmed.length >= HIGH_QUALITY_MIN_LENGTH) return 'high';
    if (trimmed.length >= MEDIUM_QUALITY_MIN_LENGTH) return 'medium';
    return 'low';
  }

  /**
   * Estimates the number of pages based on extracted text length.
   * Average PDF page contains roughly 3000 characters.
   */
  private estimatePageCount(text: string): number {
    const avgCharsPerPage = 3000;
    return Math.max(1, Math.ceil(text.length / avgCharsPerPage));
  }
}

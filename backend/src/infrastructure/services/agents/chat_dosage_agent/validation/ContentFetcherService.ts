/**
 * Service for fetching and extracting text content from URLs.
 * Supports HTML pages and PDF documents with automatic type detection.
 */

import axios from 'axios';
import { LRUCache } from 'lru-cache';
import { type FetchResult, type ValidationConfig, DEFAULT_VALIDATION_CONFIG } from './types';
import { pdfToText } from '../../../ocr/pdfToText';
import { extractMarkdownWithMistralOCRFromUrl } from '../../../ocr/mistral';

/**
 * Service for fetching content from URLs and extracting text.
 * Uses caching to avoid repeated fetches of the same URL.
 */
export class ContentFetcherService {
  private readonly cache: LRUCache<string, FetchResult>;
  private readonly config: Required<ValidationConfig>;

  constructor(config?: Partial<ValidationConfig>) {
    this.config = { ...DEFAULT_VALIDATION_CONFIG, ...config };
    this.cache = new LRUCache({
      max: this.config.cacheMaxSize,
      ttl: this.config.cacheTtl,
    });
  }

  /**
   * Fetches content from a URL and extracts text.
   * Automatically detects content type (HTML or PDF) and uses appropriate extraction.
   *
   * @param url - The URL to fetch
   * @param useMistralOcr - Whether to use Mistral OCR for PDF (for scientific documents)
   * @returns FetchResult with extracted text
   */
  async fetch(url: string, useMistralOcr = false): Promise<FetchResult> {
    // Check cache first
    const cached = this.cache.get(url);
    if (cached) {
      return cached;
    }

    try {
      // First, do a HEAD request to determine content type
      const contentType = await this.detectContentType(url);

      let result: FetchResult;

      if (contentType === 'pdf') {
        result = await this.fetchPdf(url, useMistralOcr);
      } else if (contentType === 'html') {
        result = await this.fetchHtml(url);
      } else {
        // Try HTML as fallback
        result = await this.fetchHtml(url);
      }

      // Cache successful results
      if (result.success) {
        this.cache.set(url, result);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown fetch error';
      return {
        success: false,
        contentType: 'unknown',
        text: '',
        error: errorMessage,
      };
    }
  }

  /**
   * Detects the content type of a URL by checking headers and URL extension.
   */
  private async detectContentType(url: string): Promise<'html' | 'pdf' | 'unknown'> {
    // First check URL extension
    const urlLower = url.toLowerCase();
    if (urlLower.endsWith('.pdf') || urlLower.includes('.pdf?')) {
      return 'pdf';
    }
    if (
      urlLower.endsWith('.html') ||
      urlLower.endsWith('.htm') ||
      !urlLower.match(/\.[a-z]{2,4}(?:\?|$)/)
    ) {
      // If no extension or .html/.htm, likely HTML
      return 'html';
    }

    // Try HEAD request for Content-Type
    try {
      const response = await axios.head(url, {
        timeout: 5000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        maxRedirects: 5,
      });

      const contentTypeHeader = response.headers['content-type']?.toLowerCase() ?? '';

      if (contentTypeHeader.includes('application/pdf')) {
        return 'pdf';
      }
      if (contentTypeHeader.includes('text/html') || contentTypeHeader.includes('text/plain')) {
        return 'html';
      }
    } catch {
      // HEAD request failed, will try based on extension or default to HTML
    }

    return 'unknown';
  }
  /**
   * Fetches and extracts text from an HTML page.
   */
  private async fetchHtml(url: string): Promise<FetchResult> {
    try {
      const response = await axios.get<string>(url, {
        timeout: this.config.htmlFetchTimeout,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        responseType: 'text',
        maxRedirects: 5,
      });
      const text = this.extractTextFromHtml(response.data);
      return {
        success: true,
        contentType: 'html',
        text,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'HTML fetch failed';
      return {
        success: false,
        contentType: 'html',
        text: '',
        error: errorMessage,
      };
    }
  }
  /**
   * Fetches and extracts text from a PDF document.
   */
  private async fetchPdf(url: string, useMistralOcr: boolean): Promise<FetchResult> {
    try {
      if (useMistralOcr) {
        // Use Mistral OCR for scientific documents
        const text = await this.fetchPdfWithMistral(url);
        return {
          success: true,
          contentType: 'pdf',
          text,
        };
      }
      // Use pdfToText for standard PDFs
      const text = await this.fetchPdfWithPdfToText(url);
      return {
        success: true,
        contentType: 'pdf',
        text,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'PDF fetch failed';
      // Try Mistral OCR as fallback if pdfToText failed
      if (!useMistralOcr) {
        try {
          const text = await this.fetchPdfWithMistral(url);
          return {
            success: true,
            contentType: 'pdf',
            text,
          };
        } catch {
          // Both methods failed
        }
      }
      return {
        success: false,
        contentType: 'pdf',
        text: '',
        error: errorMessage,
      };
    }
  }
  /**
   * Fetches PDF and extracts text using pdfToText library.
   */
  private async fetchPdfWithPdfToText(url: string): Promise<string> {
    const response = await axios.get<ArrayBuffer>(url, {
      timeout: this.config.pdfFetchTimeout,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/pdf,*/*',
      },
      maxRedirects: 5,
    });
    const buffer = Buffer.from(response.data);
    const result = await pdfToText(buffer);
    return result.text;
  }
  /**
   * Fetches PDF and extracts text using Mistral OCR.
   */
  private async fetchPdfWithMistral(url: string): Promise<string> {
    // Mistral OCR accepts URL directly
    const text = await extractMarkdownWithMistralOCRFromUrl(url);
    return text;
  }
  /**
   * Extracts plain text from HTML content.
   * Removes scripts, styles, and HTML tags.
   */
  private extractTextFromHtml(html: string): string {
    // Remove scripts and styles
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
    // Remove HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    // Remove HTML tags but keep content
    text = text.replace(/<[^>]+>/g, ' ');
    // Decode HTML entities
    text = this.decodeHtmlEntities(text);
    // Normalize whitespace
    text = text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    return text;
  }
  /**
   * Decodes common HTML entities.
   */
  private decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&nbsp;': ' ',
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&euro;': '€',
      '&copy;': '©',
      '&reg;': '®',
      '&trade;': '™',
      '&ndash;': '–',
      '&mdash;': '—',
      '&lsquo;': '\u2018',
      '&rsquo;': '\u2019',
      '&ldquo;': '\u201C',
      '&rdquo;': '\u201D',
      '&bull;': '•',
      '&hellip;': '…',
      '&deg;': '°',
      '&plusmn;': '±',
      '&times;': '×',
      '&divide;': '÷',
      '&frac12;': '½',
      '&frac14;': '¼',
      '&frac34;': '¾',
    };
    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
      decoded = decoded.replace(new RegExp(entity, 'g'), char);
    }
    // Handle numeric entities
    decoded = decoded.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
    return decoded;
  }
  /**
   * Clears the cache.
   */
  clearCache(): void {
    this.cache.clear();
  }
  /**
   * Gets cache statistics.
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.cacheMaxSize,
    };
  }
}

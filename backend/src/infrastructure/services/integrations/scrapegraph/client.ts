import type {
  ScrapeGraphConfig,
  ScrapeGraphSmartScraperRequest,
  ScrapeGraphResponse,
} from './types';

const DEFAULT_BASE_URL = 'https://api.scrapegraphai.com/v1';
const DEFAULT_TIMEOUT = 120000; // 2 minutes
const DEFAULT_MAX_RETRIES = 3;

/**
 * ScrapeGraph AI API Client
 */
export class ScrapeGraphClient {
  private readonly config: Required<ScrapeGraphConfig>;

  constructor(config: ScrapeGraphConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
    };
  }

  /**
   * Executes SmartScraper to extract structured data from URL
   */
  async smartScrape<T = unknown>(
    request: ScrapeGraphSmartScraperRequest,
  ): Promise<ScrapeGraphResponse<T>> {
    return this.executeWithRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      try {
        const response = await fetch(`${this.config.baseUrl}/smartscraper`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'SGAI-APIKEY': this.config.apiKey,
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          console.error('[SCRAPEGRAPH] API error response:', error);
          throw new Error(
            `ScrapeGraph API error: ${(error as { message?: string }).message ?? response.statusText}`,
          );
        }

        const data = await response.json();
        console.log('[SCRAPEGRAPH] Raw API response:', JSON.stringify(data, null, 2));
        return data as ScrapeGraphResponse<T>;
      } finally {
        clearTimeout(timeoutId);
      }
    });
  }

  /**
   * Retry wrapper with exponential backoff
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    retries: number = this.config.maxRetries,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.warn(
            `[SCRAPEGRAPH] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
            lastError.message,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}

/**
 * Factory function to create configured client
 */
export function createScrapeGraphClient(apiKey?: string): ScrapeGraphClient {
  const key = apiKey ?? process.env.SCRAPERGRAPH_API_KEY;

  if (!key) {
    throw new Error('SCRAPERGRAPH_API_KEY is required');
  }

  return new ScrapeGraphClient({ apiKey: key });
}

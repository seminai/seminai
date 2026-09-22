import type { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import {
  extractDisciplinariFromUrl,
  ScrapeGraphExtractionParams,
} from '../../services/tool/scrapeGraphDisciplinariTool';
import type { DisciplinariExtractionCategory } from '../../services/integrations/scrapegraph';

const VALID_CATEGORIES: DisciplinariExtractionCategory[] = [
  'metadata',
  'rules',
  'defense_targets',
  'interventions',
  'scope_entities',
];

/**
 * Controller for ScrapeGraph AI web scraping operations.
 */
export class ScrapeGraphController {
  /**
   * Extracts structured data from a disciplinari URL using ScrapeGraph AI.
   */
  async extractFromUrl(request: Request, response: Response): Promise<Response> {
    const body = request.body as {
      url?: string;
      region?: string;
      year?: number;
      category?: string;
      saveToDatabase?: boolean;
    };

    const url = body.url?.trim();
    if (!url) {
      throw AppError.badRequest('URL is required', 'MISSING_URL');
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      throw AppError.badRequest('Invalid URL format', 'INVALID_URL');
    }

    // Validate category if provided
    const category = body.category as DisciplinariExtractionCategory | undefined;
    if (category && !VALID_CATEGORIES.includes(category)) {
      throw AppError.badRequest(
        `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
        'INVALID_CATEGORY',
      );
    }

    const userId = (request as { user?: { id?: string } }).user?.id;

    const params: ScrapeGraphExtractionParams = {
      url,
      region: body.region?.trim(),
      year: body.year,
      category,
      saveToDatabase: body.saveToDatabase ?? false,
      userId,
    };

    const result = await extractDisciplinariFromUrl(params);

    if (!result.success) {
      return response.status(422).json({
        status: 'error',
        error: {
          code: 'EXTRACTION_FAILED',
          message: result.error ?? 'Extraction failed',
        },
        data: {
          category: result.category,
          sourceUrl: result.sourceUrl,
        },
      });
    }

    return response.json({
      status: 'success',
      data: {
        category: result.category,
        confidence: result.confidence,
        sourceUrl: result.sourceUrl,
        databaseId: result.databaseId,
        extractedData: result.data,
      },
    });
  }

  /**
   * Extracts data from multiple URLs in batch.
   */
  async batchExtract(request: Request, response: Response): Promise<Response> {
    const body = request.body as {
      urls?: Array<{
        url: string;
        category?: string;
      }>;
      saveToDatabase?: boolean;
    };

    const urls = body.urls;
    if (!Array.isArray(urls) || urls.length === 0) {
      throw AppError.badRequest('urls array is required', 'MISSING_URLS');
    }

    if (urls.length > 10) {
      throw AppError.badRequest('Maximum 10 URLs per batch', 'TOO_MANY_URLS');
    }

    const userId = (request as { user?: { id?: string } }).user?.id;

    const results = await Promise.all(
      urls.map(async (item) => {
        const url = item.url?.trim();
        if (!url) {
          return {
            url: item.url,
            success: false,
            error: 'Invalid URL',
          };
        }

        try {
          new URL(url);
        } catch {
          return {
            url,
            success: false,
            error: 'Invalid URL format',
          };
        }

        const category = item.category as DisciplinariExtractionCategory | undefined;
        if (category && !VALID_CATEGORIES.includes(category)) {
          return {
            url,
            success: false,
            error: `Invalid category: ${category}`,
          };
        }

        const result = await extractDisciplinariFromUrl({
          url,
          category,
          saveToDatabase: body.saveToDatabase ?? false,
          userId,
        });

        return {
          url,
          success: result.success,
          category: result.category,
          confidence: result.confidence,
          databaseId: result.databaseId,
          error: result.error,
          data: result.success ? result.data : undefined,
        };
      }),
    );

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return response.json({
      status: 'success',
      data: {
        total: results.length,
        successful,
        failed,
        results,
      },
    });
  }

  /**
   * Returns supported extraction categories.
   */
  async getCategories(_request: Request, response: Response): Promise<Response> {
    return response.json({
      status: 'success',
      data: {
        categories: VALID_CATEGORIES.map((cat) => ({
          value: cat,
          description: getCategoryDescription(cat),
        })),
      },
    });
  }
}

function getCategoryDescription(category: DisciplinariExtractionCategory): string {
  const descriptions: Record<DisciplinariExtractionCategory, string> = {
    metadata: 'Metadati del documento (regione, anno, validità, titolo)',
    rules: 'Regole generali, principi, divieti e obblighi',
    defense_targets: 'Avversità (parassiti, malattie) e relativi interventi ammessi',
    interventions: 'Interventi fitosanitari ammessi (prodotti, dosi, limiti)',
    scope_entities: 'Colture, sezioni e sottosezioni del disciplinare',
  };
  return descriptions[category];
}

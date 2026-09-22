import { parse } from 'csv-parse/sync';
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  VectorSearchQdrantService,
  createVectorSearchQdrantService,
} from '../../services/tool/vectorSearchQdrant';

type DisciplinareRecord = Readonly<{ title: string; anno: string; url: string }>;
type ProcessingResult = Readonly<{
  title: string;
  url: string;
  success: boolean;
  error?: string;
}>;
type SearchRequest = Readonly<{ query: string; limit?: number }>;

/** Handles optional Qdrant indexing and semantic search. */
export class VectorSearchController {
  private readonly csvPath = path.join(
    process.cwd(),
    'dataset',
    'disciplinari',
    'bdf.csv',
  );

  async upsertDisciplinariQdrant(_request: Request, response: Response): Promise<Response> {
    try {
      const records = this.readRecords();
      const service = createVectorSearchQdrantService('disciplinari_bdf');
      const results: ProcessingResult[] = [];
      for (let index = 0; index < records.length; index += 3) {
        results.push(...(await this.processBatch(service, records.slice(index, index + 3))));
      }
      const successCount = results.filter((result) => result.success).length;
      const errorCount = results.length - successCount;
      return response.status(errorCount === 0 ? 200 : 207).json({
        success: errorCount === 0,
        message:
          errorCount === 0
            ? 'All disciplinari processed successfully'
            : `Processed with ${errorCount} errors`,
        totalProcessed: results.length,
        successCount,
        errorCount,
        results,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return response.status(500).json({
        success: false,
        message: `Fatal error: ${message}`,
        totalProcessed: 0,
        successCount: 0,
        errorCount: 0,
        results: [],
      });
    }
  }

  async getAnswerQdrant(request: Request, response: Response): Promise<Response> {
    try {
      const { query, limit } = request.body as SearchRequest;
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return response.status(400).json({
          success: false,
          message: 'Query is required and must be a non-empty string',
        });
      }
      const searchLimit = limit && Number.isInteger(limit) && limit > 0 ? limit : 5;
      const results = await createVectorSearchQdrantService(
        'disciplinari_bdf',
      ).similaritySearchWithScore(query, searchLimit);
      const formattedResults = results.map(([document, score]) => ({
        content: document.pageContent,
        score,
        source: document.metadata.source as string,
        chunkIndex: document.metadata.chunkIndex as number,
        sourceType: document.metadata.sourceType as string,
      }));
      return response.status(200).json({
        success: true,
        query,
        limit: searchLimit,
        resultsCount: formattedResults.length,
        results: formattedResults,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return response.status(500).json({
        success: false,
        message: `Search error: ${message}`,
      });
    }
  }

  private readRecords(): DisciplinareRecord[] {
    if (!fs.existsSync(this.csvPath)) {
      throw new Error(`CSV file not found: ${this.csvPath}`);
    }
    return parse(fs.readFileSync(this.csvPath, 'utf-8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as DisciplinareRecord[];
  }

  private async processBatch(
    service: VectorSearchQdrantService,
    records: DisciplinareRecord[],
  ): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];
    for (const record of records) {
      results.push(await this.processRecord(service, record));
    }
    return results;
  }

  private async processRecord(
    service: VectorSearchQdrantService,
    record: DisciplinareRecord,
  ): Promise<ProcessingResult> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= 2; attempt += 1) {
      try {
        await service.processPdfUrlAndSave(record.url);
        return { title: record.title, url: record.url, success: true };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
        }
      }
    }
    return {
      title: record.title,
      url: record.url,
      success: false,
      error: lastError?.message ?? 'Unknown error',
    };
  }
}

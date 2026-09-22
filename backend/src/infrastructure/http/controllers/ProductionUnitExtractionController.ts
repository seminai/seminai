import { Request, Response } from 'express';
import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { AppError } from '../../../domain/errors/AppError';
import {
  ProductionUnitCsvAgent,
  ProductionUnitRaw,
} from '../../services/agents/production_unit/production_unit_csv_agent';
import { PianoColturalePdfAgent } from '../../services/agents/file_agent/piano_colturale_pdf_agent';
import {
  buildFieldIndex,
  buildProductionUnitPreview,
  getCropCatalog,
} from '../../services/extraction/production-unit-normalizer';
import { resolveProductionUnitCompanyId } from './production-unit-request';

type UploadedProductionUnitFile = Readonly<{
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}>;

export class ProductionUnitExtractionController {
  constructor(private readonly fieldRepository: IFieldRepository) {}

  async extract(request: Request, response: Response): Promise<Response> {
    const file = request.file;
    if (!file) throw AppError.badRequest('No file uploaded', 'NO_FILE');
    const companyId = resolveProductionUnitCompanyId(request);
    if (!companyId) throw AppError.badRequest('Missing companyId', 'MISSING_COMPANY_ID');
    if (this.isPdf(file)) return this.extractPdf(file, companyId, response);

    const result = await new ProductionUnitCsvAgent().extractProductionUnitsFromCsv(file.buffer);
    const productionUnits = await this.buildPreviews(result.units, companyId);
    return response.json({
      status: 'success',
      data: {
        productionUnits,
        extractedCount: productionUnits.length,
        diagnostics: result.diagnostics,
      },
    });
  }

  private async extractPdf(
    file: UploadedProductionUnitFile,
    companyId: string,
    response: Response,
  ): Promise<Response> {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    const sendEvent = (payload: Record<string, unknown>): void => {
      response.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    try {
      const result = await new PianoColturalePdfAgent().extractFromPdf(
        file.buffer,
        (completed, total) => {
          sendEvent({
            type: 'progress',
            completed,
            total,
            progress: Math.round(((completed + 1) / total) * 100),
          });
        },
      );
      const productionUnits = await this.buildPreviews(
        result.productionUnits.units,
        companyId,
      );
      sendEvent({
        type: 'result',
        data: {
          productionUnits,
          extractedCount: productionUnits.length,
          diagnostics: result.productionUnits.diagnostics,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore durante estrazione PDF';
      sendEvent({ type: 'error', message });
    }
    response.end();
    return response;
  }

  private isPdf(file: UploadedProductionUnitFile): boolean {
    return file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
  }

  private async buildPreviews(rawUnits: ProductionUnitRaw[], companyId: string) {
    const fields = await this.fieldRepository.findManyByCompanyId(companyId);
    const fieldIndex = buildFieldIndex(fields);
    const cropCatalog = getCropCatalog();
    return rawUnits.map((unit) =>
      buildProductionUnitPreview(unit, companyId, fieldIndex, cropCatalog),
    );
  }
}

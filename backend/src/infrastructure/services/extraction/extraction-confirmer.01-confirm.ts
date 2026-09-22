import { AppError } from '../../../domain/errors/AppError';
import { type ConfirmExtractionRequestDTO } from '../../../domain/dtos/extraction-confirm-request.dto';
import { ConfirmResult } from './extraction-confirmer.support';
import type { ExtractionConfirmerContext } from './extraction-confirmer.context';

export async function extractionConfirmerConfirm(this: ExtractionConfirmerContext, extractionId: string, requestData?: ConfirmExtractionRequestDTO): Promise<ConfirmResult> {
    const extraction = await this.fileExtractionRepository.findById(extractionId);
    if (!extraction) {
      throw AppError.notFound('Extraction not found', 'EXTRACTION_NOT_FOUND');
    }
    if (extraction.status !== 'PENDING_CONFIRMATION') {
      throw AppError.badRequest(
        `Cannot confirm extraction with status ${extraction.status}`,
        'INVALID_EXTRACTION_STATUS',
      );
    }
    if (!extraction.extractedData) {
      throw AppError.badRequest('No extracted data to confirm', 'NO_EXTRACTED_DATA');
    }
    const summary = await this.dispatchConfirmation(extraction, requestData);
    await this.fileExtractionRepository.update(extractionId, { status: 'CONFIRMED' });
    return { extractionId, category: extraction.category, status: 'CONFIRMED', summary };
  }

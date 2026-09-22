import type { Request, Response } from 'express';
import type { LabelControllerContext } from './label-controller.context';
import { labelControllerExtract } from './label-controller.01-extract';
import { labelControllerGetBdfLabelDetail } from './label-controller.02-get-bdf-label-detail';
import { labelControllerListBdfLabelPairs } from './label-controller.03-list-bdf-label-pairs';
import { labelControllerBulkExtract } from './label-controller.04-bulk-extract';
import { labelControllerBulkExtractFromPdfFiles } from './label-controller.05-bulk-extract-from-pdf-files';
import { labelControllerExportCsv } from './label-controller.06-export-csv';
import { labelControllerListSummary } from './label-controller.07-list-summary';
import { labelControllerGetById } from './label-controller.08-get-by-id';
import { labelControllerGetByProductAndRegistration } from './label-controller.09-get-by-product-and-registration';
import { labelControllerBulkDelete } from './label-controller.10-bulk-delete';
import { labelControllerBulkExtractFromPdfFilesAsync } from './label-controller.11-bulk-extract-from-pdf-files-async';
import { labelControllerBulkExtractFromPdfFilesFertilizerAsync } from './label-controller.12-bulk-extract-from-pdf-files-fertilizer-async';
import { labelControllerGetJobStatus } from './label-controller.13-get-job-status';
import { labelControllerUpdate } from './label-controller.14-update';
import { labelControllerVerifyLabel } from './label-controller.15-verify-label';
import { labelControllerUpdateLabel } from './label-controller.16-update-label';
import { labelControllerExtractLabelWithMistral } from './label-controller.17-extract-label-with-mistral';
import { labelControllerExtractLabelWithGpt } from './label-controller.18-extract-label-with-gpt';
import { labelControllerGetLabelHistory } from './label-controller.19-get-label-history';
import { labelControllerRollbackLabel } from './label-controller.20-rollback-label';


export class LabelController {

  async extract(request: Request, response: Response): Promise<Response> {
    return labelControllerExtract.call(this as unknown as LabelControllerContext, request, response);
  }

  async getBdfLabelDetail(request: Request, response: Response): Promise<Response> {
    return labelControllerGetBdfLabelDetail.call(this as unknown as LabelControllerContext, request, response);
  }

  async listBdfLabelPairs(_request: Request, response: Response): Promise<Response> {
    return labelControllerListBdfLabelPairs.call(this as unknown as LabelControllerContext, _request, response);
  }

  async bulkExtract(request: Request, response: Response): Promise<Response> {
    return labelControllerBulkExtract.call(this as unknown as LabelControllerContext, request, response);
  }

  async bulkExtractFromPdfFiles(request: Request, response: Response): Promise<Response> {
    return labelControllerBulkExtractFromPdfFiles.call(this as unknown as LabelControllerContext, request, response);
  }

  async exportCsv(_request: Request, response: Response): Promise<Response> {
    return labelControllerExportCsv.call(this as unknown as LabelControllerContext, _request, response);
  }

  async listSummary(_request: Request, response: Response): Promise<Response> {
    return labelControllerListSummary.call(this as unknown as LabelControllerContext, _request, response);
  }

  async getById(request: Request, response: Response): Promise<Response> {
    return labelControllerGetById.call(this as unknown as LabelControllerContext, request, response);
  }

  async getByProductAndRegistration(request: Request, response: Response): Promise<Response> {
    return labelControllerGetByProductAndRegistration.call(this as unknown as LabelControllerContext, request, response);
  }

  async bulkDelete(request: Request, response: Response): Promise<Response> {
    return labelControllerBulkDelete.call(this as unknown as LabelControllerContext, request, response);
  }

  async bulkExtractFromPdfFilesAsync(request: Request, response: Response): Promise<Response> {
    return labelControllerBulkExtractFromPdfFilesAsync.call(this as unknown as LabelControllerContext, request, response);
  }

  async bulkExtractFromPdfFilesFertilizerAsync(
    request: Request,
    response: Response,
  ): Promise<Response> {
    return labelControllerBulkExtractFromPdfFilesFertilizerAsync.call(this as unknown as LabelControllerContext, request, response);
  }

  async getJobStatus(request: Request, response: Response): Promise<Response> {
    return labelControllerGetJobStatus.call(this as unknown as LabelControllerContext, request, response);
  }

  async update(request: Request, response: Response): Promise<Response> {
    return labelControllerUpdate.call(this as unknown as LabelControllerContext, request, response);
  }

  async verifyLabel(request: Request, response: Response): Promise<Response> {
    return labelControllerVerifyLabel.call(this as unknown as LabelControllerContext, request, response);
  }

  async updateLabel(request: Request, response: Response): Promise<Response> {
    return labelControllerUpdateLabel.call(this as unknown as LabelControllerContext, request, response);
  }

  async extractLabelWithMistral(request: Request, response: Response): Promise<Response> {
    return labelControllerExtractLabelWithMistral.call(this as unknown as LabelControllerContext, request, response);
  }

  /**
   * Re-extracts label data using GPT-4o Vision with high-resolution PDF images.
   * First enhances the rawText using GPT Vision, then extracts structured data.
   */
  async extractLabelWithGpt(request: Request, response: Response): Promise<Response> {
    return labelControllerExtractLabelWithGpt.call(this as unknown as LabelControllerContext, request, response);
  }

  async getLabelHistory(request: Request, response: Response): Promise<Response> {
    return labelControllerGetLabelHistory.call(this as unknown as LabelControllerContext, request, response);
  }

  async rollbackLabel(request: Request, response: Response): Promise<Response> {
    return labelControllerRollbackLabel.call(this as unknown as LabelControllerContext, request, response);
  }
}

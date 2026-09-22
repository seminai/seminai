import type { Request, Response } from 'express';

export interface LabelControllerContext {
  extract(request: Request, response: Response): Promise<Response>;
  getBdfLabelDetail(request: Request, response: Response): Promise<Response>;
  listBdfLabelPairs(_request: Request, response: Response): Promise<Response>;
  bulkExtract(request: Request, response: Response): Promise<Response>;
  bulkExtractFromPdfFiles(request: Request, response: Response): Promise<Response>;
  exportCsv(_request: Request, response: Response): Promise<Response>;
  listSummary(_request: Request, response: Response): Promise<Response>;
  getById(request: Request, response: Response): Promise<Response>;
  getByProductAndRegistration(request: Request, response: Response): Promise<Response>;
  bulkDelete(request: Request, response: Response): Promise<Response>;
  bulkExtractFromPdfFilesAsync(request: Request, response: Response): Promise<Response>;
  bulkExtractFromPdfFilesFertilizerAsync(request: Request, response: Response): Promise<Response>;
  getJobStatus(request: Request, response: Response): Promise<Response>;
  update(request: Request, response: Response): Promise<Response>;
  verifyLabel(request: Request, response: Response): Promise<Response>;
  updateLabel(request: Request, response: Response): Promise<Response>;
  extractLabelWithMistral(request: Request, response: Response): Promise<Response>;
  extractLabelWithGpt(request: Request, response: Response): Promise<Response>;
  getLabelHistory(request: Request, response: Response): Promise<Response>;
  rollbackLabel(request: Request, response: Response): Promise<Response>;
}

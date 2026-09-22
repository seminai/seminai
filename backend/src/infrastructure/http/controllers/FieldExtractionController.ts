import AdmZip from 'adm-zip';
import { Request, Response } from 'express';
import { FieldBulkPreview } from '../../../domain/dtos/file-extraction.dto';
import { AppError } from '../../../domain/errors/AppError';
import { getFieldExtractionQueue } from '../../queue/FieldExtractionQueue';
import { FieldCsvAgent } from '../../services/agents/file_agent/field_csv_agent';
import { normalizeExtractedField } from '../../services/extraction/field-normalizer';
import { parseShapefile } from '../../services/shapefile-parser';
import { requireAuthenticatedUserId } from './controller-auth';

type UploadedFile = Readonly<{ name: string; buffer: Buffer }>;

/** Handles queued and direct field extraction. */
export class FieldExtractionController {
  async startJob(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const file = request.file;
    if (!file) throw AppError.badRequest('No file uploaded', 'NO_FILE');
    const { companyId } = request.body;
    if (!companyId) throw AppError.badRequest('Missing companyId', 'MISSING_COMPANY_ID');
    const queue = getFieldExtractionQueue();
    const jobId = await queue.addJob({
      fileBuffer: file.buffer,
      companyId,
      userId,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });
    const isPdf =
      file.originalname?.toLowerCase().endsWith('.pdf') || file.mimetype === 'application/pdf';
    if (isPdf) {
      return response.status(202).json({
        status: 'accepted',
        message: 'PDF extraction job started — poll for status',
        data: { jobId },
      });
    }
    return this.pollJob(jobId, response);
  }

  async getJobStatus(request: Request, response: Response): Promise<Response> {
    requireAuthenticatedUserId(request);
    const { jobId } = request.params;
    if (!jobId) throw AppError.badRequest('Missing jobId', 'MISSING_JOB_ID');
    try {
      const status = await getFieldExtractionQueue().getJobStatus(jobId);
      if (status.state === 'completed' && status.result) {
        return response.json({
          status: 'success',
          data: {
            state: 'completed',
            progress: 100,
            fields: status.result.fields,
            extractedCount: status.result.extractedCount,
          },
        });
      }
      if (status.state === 'failed') {
        return response.status(422).json({
          status: 'error',
          message: status.failedReason || 'Extraction failed',
          data: { state: 'failed', progress: status.progress },
        });
      }
      return response.json({
        status: 'processing',
        data: { state: status.state, progress: status.progress, message: status.message },
      });
    } catch {
      throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
    }
  }

  async extractOnly(request: Request, response: Response): Promise<Response> {
    requireAuthenticatedUserId(request);
    const uploadedFiles = (request.files as Express.Multer.File[]) ?? [];
    if (uploadedFiles.length === 0) throw AppError.badRequest('No file uploaded', 'NO_FILE');
    const { companyId } = request.body;
    if (!companyId) throw AppError.badRequest('Missing companyId', 'MISSING_COMPANY_ID');
    const files = this.resolveUploadedFiles(uploadedFiles);
    try {
      if (files.some((file) => file.name.toLowerCase().endsWith('.shp'))) {
        return await this.extractShapefile(files, companyId, response);
      }
      if (files.length !== 1) {
        throw AppError.badRequest('Expected a single CSV/Excel file', 'INVALID_FILE_COUNT');
      }
      const result = await new FieldCsvAgent().extractFieldsFromCsv(files[0].buffer);
      return response.json({
        status: 'success',
        data: {
          fields: result.fields.map((field) => normalizeExtractedField(field, companyId)),
          extractedCount: result.fields.length,
          diagnostics: result.diagnostics,
        },
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('Error during field extraction:', error);
      throw AppError.internal('Field extraction failed', 'EXTRACTION_FAILED');
    }
  }

  private async pollJob(jobId: string, response: Response): Promise<Response> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const status = await getFieldExtractionQueue().getJobStatus(jobId);
      if (status.state === 'completed') {
        if (!status.result) {
          return response.status(422).json({
            status: 'error',
            message: 'Extraction job completed but no result available',
          });
        }
        return response.json({
          status: 'success',
          data: {
            fields: status.result.fields,
            extractedCount: status.result.extractedCount,
          },
        });
      }
      if (status.state === 'failed') {
        return response.status(422).json({
          status: 'error',
          message: 'Extraction job failed',
          error: status.failedReason,
        });
      }
    }
    return response.status(202).json({
      status: 'accepted',
      message: 'Job is still processing',
      data: { jobId },
    });
  }

  private resolveUploadedFiles(files: Express.Multer.File[]): UploadedFile[] {
    if (files.length === 1 && files[0].originalname.toLowerCase().endsWith('.zip')) {
      return new AdmZip(files[0].buffer)
        .getEntries()
        .filter((entry) => !entry.isDirectory)
        .map((entry) => ({
          name: entry.entryName.split('/').pop() ?? entry.entryName,
          buffer: entry.getData(),
        }));
    }
    return files.map((file) => ({ name: file.originalname, buffer: file.buffer }));
  }

  private async extractShapefile(
    files: UploadedFile[],
    companyId: string,
    response: Response,
  ): Promise<Response> {
    const shpFile = files.find((file) => file.name.toLowerCase().endsWith('.shp'));
    const dbfFile = files.find((file) => file.name.toLowerCase().endsWith('.dbf'));
    if (!shpFile || !dbfFile) {
      throw AppError.badRequest(
        'Shapefile upload requires at least .shp and .dbf files',
        'MISSING_SHAPEFILE_COMPONENTS',
      );
    }
    const result = await parseShapefile(shpFile.buffer, dbfFile.buffer);
    const fields: FieldBulkPreview[] = result.fields.map((field) => ({
      companyId,
      name: field.name,
      coordinates: field.coordinates,
      coordinatesGaussBoaga: field.coordinatesGaussBoaga,
      latitude: field.latitude,
      longitude: field.longitude,
      polygon: field.polygon,
      polygonGaussBoaga: field.polygonGaussBoaga,
      gisHa: field.gisHa,
      sauHa: field.sauHa,
      soilType: field.soilType,
      uso: field.uso,
      qualita: field.qualita,
      inizioConduzione: field.inizioConduzione,
      fineConduzione: field.fineConduzione,
      nation: field.nation,
      region: field.region,
      city: field.city,
      address: field.address,
      sezione: field.sezione,
      foglio: field.foglio,
      particella: field.particella,
      subalterno: field.subalterno,
      superficieCatastaleMq: field.superficieCatastaleMq,
      cap: field.cap,
      variazioneMq: field.variazioneMq,
      ph: field.ph,
      nitrogen: field.nitrogen,
      phosphorus: field.phosphorus,
      potassium: field.potassium,
      calcium: field.calcium,
      magnesium: field.magnesium,
    }));
    return response.json({
      status: 'success',
      data: {
        fields,
        productionUnits: result.productionUnits,
        extractedCount: result.fields.length,
        diagnostics: result.diagnostics,
      },
    });
  }
}

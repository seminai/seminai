import { Request, Response } from 'express';
import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { AppError } from '../../../domain/errors/AppError';
import { Field } from '../../../domain/entities/Field';
import { type FieldBulkPreview } from '../../../domain/dtos/file-extraction.dto';
import { GetFieldsAvailabilityUseCase } from '../../../application/use-cases/field/GetFieldsAvailabilityUseCase';
import { DeleteFieldsBulkUseCase } from '../../../application/use-cases/field/DeleteFieldsBulkUseCase';
import { getFieldExtractionQueue } from '../../queue/FieldExtractionQueue';
import { FieldCsvAgent } from '../../services/agents/file_agent/field_csv_agent';
import { normalizeExtractedField } from '../../services/extraction/field-normalizer';
import { parseShapefile } from '../../services/shapefile-parser';
import AdmZip from 'adm-zip';
import { resolveFieldConductionDates } from '../../utils/field-conduction-dates';
import { resolveFieldSauHa } from '../../utils/resolve-field-sau-ha';

const DEFAULT_SEZIONE_VALUE = 'UNSPECIFIED';

export class FieldController {
  constructor(
    private readonly fieldRepository: IFieldRepository,
    private readonly getFieldsAvailabilityUseCase?: GetFieldsAvailabilityUseCase,
    private readonly deleteBulkUseCase?: DeleteFieldsBulkUseCase,
  ) {}

  private sanitizeSection(section?: string | null): string {
    return section?.trim() || DEFAULT_SEZIONE_VALUE;
  }

  async create(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const body = request.body as Partial<Field> & { companyId: string; name: string };

    if (
      !body.name ||
      !body.address ||
      !body.foglio ||
      !body.particella ||
      typeof body.superficieCatastaleMq === 'undefined'
    ) {
      throw AppError.badRequest('Missing required fields', 'MISSING_FIELDS');
    }

    const { inizioConduzione, fineConduzione } = resolveFieldConductionDates(
      body.inizioConduzione,
      body.fineConduzione,
    );

    const entity = Field.create({
      companyId: body.companyId || null,
      sourceFileId: body.sourceFileId ?? null,
      name: body.name,
      coordinates: body.coordinates ?? [],
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      polygon: body.polygon ?? null,
      gisHa: body.gisHa ?? null,
      sauHa: resolveFieldSauHa(body.sauHa, body.gisHa, body.superficieCatastaleMq) ?? null,
      ph: body.ph ?? null,
      nitrogen: body.nitrogen ?? null,
      phosphorus: body.phosphorus ?? null,
      potassium: body.potassium ?? null,
      calcium: body.calcium ?? null,
      magnesium: body.magnesium ?? null,
      soilType: body.soilType ?? null,
      uso: body.uso ?? null,
      qualita: body.qualita ?? null,
      superficieCatastaleMq: body.superficieCatastaleMq!,
      sezione: this.sanitizeSection(body.sezione),
      foglio: body.foglio,
      particella: body.particella,
      subalterno: body.subalterno ?? null,
      nation: body.nation ?? null,
      region: body.region ?? null,
      city: body.city ?? null,
      address: body.address,
      cap: body.cap ?? null,
      variazioneMq: body.variazioneMq ?? null,
      inizioConduzione,
      fineConduzione,
      bufferZoneNotes: null,
    });

    const created = await this.fieldRepository.create(entity);
    return response.status(201).json({ status: 'success', data: { field: created } });
  }

  async createBulk(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { fields } = request.body as {
      fields: Array<Partial<Field> & { companyId: string; name: string }>;
    };

    if (!Array.isArray(fields) || fields.length === 0) {
      throw AppError.badRequest('Missing required fields', 'MISSING_FIELDS');
    }

    const toCreate: Field[] = fields.map((f) => {
      if (!f.name || !f.foglio || !f.particella || typeof f.superficieCatastaleMq === 'undefined') {
        throw AppError.badRequest(
          'Missing required fields in one or more fields',
          'MISSING_FIELDS',
        );
      }
      const { inizioConduzione, fineConduzione } = resolveFieldConductionDates(
        f.inizioConduzione,
        f.fineConduzione,
      );
      return Field.create({
        companyId: f.companyId || null,
        sourceFileId: f.sourceFileId ?? null,
        name: f.name,
        coordinates: f.coordinates ?? [],
        latitude: f.latitude ?? null,
        longitude: f.longitude ?? null,
        polygon: f.polygon ?? null,
        gisHa: f.gisHa ?? null,
        sauHa: resolveFieldSauHa(f.sauHa, f.gisHa, f.superficieCatastaleMq) ?? null,
        ph: f.ph ?? null,
        nitrogen: f.nitrogen ?? null,
        phosphorus: f.phosphorus ?? null,
        potassium: f.potassium ?? null,
        calcium: f.calcium ?? null,
        magnesium: f.magnesium ?? null,
        soilType: f.soilType ?? null,
        uso: f.uso ?? null,
        qualita: f.qualita ?? null,
        superficieCatastaleMq: f.superficieCatastaleMq!,
        sezione: this.sanitizeSection(f.sezione),
        foglio: f.foglio!,
        particella: f.particella!,
        subalterno: f.subalterno ?? null,
        nation: f.nation ?? null,
        region: f.region ?? null,
        city: f.city ?? null,
        address: f.address && f.address.trim() ? f.address.trim() : 'N/A',
        cap: f.cap ?? null,
        variazioneMq: f.variazioneMq ?? null,
        inizioConduzione,
        fineConduzione,
        bufferZoneNotes: null,
      });
    });

    await this.fieldRepository.createMany(toCreate);
    return response.status(201).json({ status: 'success', data: { count: toCreate.length } });
  }

  async findById(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;
    const field = await this.fieldRepository.findById(id);
    if (!field) {
      throw AppError.notFound('Field not found', 'FIELD_NOT_FOUND');
    }
    return response.json({ status: 'success', data: { field } });
  }

  async listByCompany(request: Request, response: Response): Promise<Response> {
    const { companyId } = request.params;
    const list = await this.fieldRepository.findManyByCompanyId(companyId);
    return response.json({ status: 'success', data: { fields: list } });
  }

  async listForCurrentUser(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const list = await this.fieldRepository.findManyByUserId(request.user.id);
    return response.json({ status: 'success', data: { fields: list } });
  }

  async update(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;
    const updateData = request.body as Partial<Field>;
    const existing = await this.fieldRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Field not found', 'FIELD_NOT_FOUND');
    }
    const updated = await this.fieldRepository.update(id, updateData);
    return response.json({ status: 'success', data: { field: updated } });
  }

  async updateBulk(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { fields } = request.body as {
      fields: Array<{ id: string } & Partial<Field>>;
    };
    if (!Array.isArray(fields) || fields.length === 0) {
      throw AppError.badRequest('Missing fields array', 'MISSING_FIELDS');
    }
    const invalidIndex = fields.findIndex((f) => !f.id);
    if (invalidIndex !== -1) {
      throw AppError.badRequest(`Missing id in fields[${invalidIndex}]`, 'MISSING_FIELD_ID');
    }
    const updates = fields.map((f) => {
      const { id, ...data } = f;
      return { id, data };
    });
    const count = await this.fieldRepository.updateMany(updates);
    return response.json({ status: 'success', data: { count } });
  }

  async delete(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;
    const existing = await this.fieldRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Field not found', 'FIELD_NOT_FOUND');
    }
    await this.fieldRepository.delete(id);
    return response.status(204).send();
  }

  async listAvailabilityByCompanies(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    if (!this.getFieldsAvailabilityUseCase) {
      throw AppError.badRequest(
        'GetFieldsAvailabilityUseCase not configured',
        'USE_CASE_NOT_CONFIGURED',
      );
    }
    const { startAt, endAt } = request.query;
    const startDate = startAt ? new Date(startAt as string) : undefined;
    const endDate = endAt ? new Date(endAt as string) : undefined;
    const result = await this.getFieldsAvailabilityUseCase.execute({
      userId: request.user.id,
      startAt: startDate,
      endAt: endDate,
    });
    return response.json({ status: 'success', data: { companies: result } });
  }

  async startExtractionJob(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const file = request.file;
    if (!file) {
      throw AppError.badRequest('No file uploaded', 'NO_FILE');
    }

    const { companyId } = request.body;
    if (!companyId) {
      throw AppError.badRequest('Missing companyId', 'MISSING_COMPANY_ID');
    }

    const queue = getFieldExtractionQueue();

    const jobId = await queue.addJob({
      fileBuffer: file.buffer,
      companyId,
      userId: request.user.id,
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

    const POLL_INTERVAL = 1000;
    const MAX_ATTEMPTS = 60;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

      const status = await queue.getJobStatus(jobId);

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

  async getExtractionJobStatus(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { jobId } = request.params;
    if (!jobId) {
      throw AppError.badRequest('Missing jobId', 'MISSING_JOB_ID');
    }

    const queue = getFieldExtractionQueue();

    try {
      const status = await queue.getJobStatus(jobId);

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
        data: {
          state: status.state,
          progress: status.progress,
          message: status.message,
        },
      });
    } catch {
      throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
    }
  }

  async extractOnly(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const uploadedFiles = (request.files as Express.Multer.File[]) ?? [];
    if (uploadedFiles.length === 0) {
      throw AppError.badRequest('No file uploaded', 'NO_FILE');
    }

    const { companyId } = request.body;
    if (!companyId) {
      throw AppError.badRequest('Missing companyId', 'MISSING_COMPANY_ID');
    }

    const resolvedFiles = this.resolveUploadedFiles(uploadedFiles);
    const isShapefile = resolvedFiles.some((f) => f.name.toLowerCase().endsWith('.shp'));

    try {
      if (isShapefile) {
        return await this.extractFromShapefile(resolvedFiles, companyId, response);
      }

      if (resolvedFiles.length !== 1) {
        throw AppError.badRequest('Expected a single CSV/Excel file', 'INVALID_FILE_COUNT');
      }

      const agent = new FieldCsvAgent();
      const result = await agent.extractFieldsFromCsv(resolvedFiles[0].buffer);

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

  /**
   * If the upload contains a single ZIP, extracts its entries as virtual files.
   * Otherwise returns the original multer files wrapped in a uniform shape.
   */
  private resolveUploadedFiles(
    multerFiles: Express.Multer.File[],
  ): Array<{ name: string; buffer: Buffer }> {
    if (multerFiles.length === 1 && multerFiles[0].originalname.toLowerCase().endsWith('.zip')) {
      const zip = new AdmZip(multerFiles[0].buffer);
      return zip
        .getEntries()
        .filter((e) => !e.isDirectory)
        .map((e) => ({
          name: e.entryName.split('/').pop() ?? e.entryName,
          buffer: e.getData(),
        }));
    }
    return multerFiles.map((f) => ({ name: f.originalname, buffer: f.buffer }));
  }

  private async extractFromShapefile(
    files: Array<{ name: string; buffer: Buffer }>,
    companyId: string,
    response: Response,
  ): Promise<Response> {
    const shpFile = files.find((f) => f.name.toLowerCase().endsWith('.shp'));
    const dbfFile = files.find((f) => f.name.toLowerCase().endsWith('.dbf'));

    if (!shpFile || !dbfFile) {
      throw AppError.badRequest(
        'Shapefile upload requires at least .shp and .dbf files',
        'MISSING_SHAPEFILE_COMPONENTS',
      );
    }

    const result = await parseShapefile(shpFile.buffer, dbfFile.buffer);

    const fields: FieldBulkPreview[] = result.fields.map((f) => ({
      companyId,
      name: f.name,
      coordinates: f.coordinates,
      coordinatesGaussBoaga: f.coordinatesGaussBoaga,
      latitude: f.latitude,
      longitude: f.longitude,
      polygon: f.polygon,
      polygonGaussBoaga: f.polygonGaussBoaga,
      gisHa: f.gisHa,
      sauHa: f.sauHa,
      soilType: f.soilType,
      uso: f.uso,
      qualita: f.qualita,
      inizioConduzione: f.inizioConduzione,
      fineConduzione: f.fineConduzione,
      nation: f.nation,
      region: f.region,
      city: f.city,
      address: f.address,
      sezione: f.sezione,
      foglio: f.foglio,
      particella: f.particella,
      subalterno: f.subalterno,
      superficieCatastaleMq: f.superficieCatastaleMq,
      cap: f.cap,
      variazioneMq: f.variazioneMq,
      ph: f.ph,
      nitrogen: f.nitrogen,
      phosphorus: f.phosphorus,
      potassium: f.potassium,
      calcium: f.calcium,
      magnesium: f.magnesium,
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

  async deleteBulk(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    if (!this.deleteBulkUseCase) {
      throw AppError.badRequest(
        'DeleteFieldsBulkUseCase not configured',
        'USE_CASE_NOT_CONFIGURED',
      );
    }
    const { ids } = request.body as {
      ids: string[];
    };
    if (!Array.isArray(ids) || ids.length === 0) {
      throw AppError.badRequest('Missing ids array', 'MISSING_IDS');
    }
    await this.deleteBulkUseCase.execute({ ids });
    return response.status(204).send();
  }
}

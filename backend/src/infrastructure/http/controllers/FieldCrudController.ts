import { Request, Response } from 'express';
import { DeleteFieldsBulkUseCase } from '../../../application/use-cases/field/DeleteFieldsBulkUseCase';
import { GetFieldsAvailabilityUseCase } from '../../../application/use-cases/field/GetFieldsAvailabilityUseCase';
import { Field } from '../../../domain/entities/Field';
import { AppError } from '../../../domain/errors/AppError';
import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { resolveFieldConductionDates } from '../../utils/field-conduction-dates';
import { resolveFieldSauHa } from '../../utils/resolve-field-sau-ha';
import { requireAuthenticatedUserId } from './controller-auth';

type FieldInput = Partial<Field> & { companyId: string; name: string };

/** Handles field persistence and availability requests. */
export class FieldCrudController {
  constructor(
    private readonly repository: IFieldRepository,
    private readonly availabilityUseCase?: GetFieldsAvailabilityUseCase,
    private readonly deleteBulkUseCase?: DeleteFieldsBulkUseCase,
  ) {}

  async create(request: Request, response: Response): Promise<Response> {
    requireAuthenticatedUserId(request);
    const entity = this.buildField(request.body as FieldInput, true);
    const field = await this.repository.create(entity);
    return response.status(201).json({ status: 'success', data: { field } });
  }

  async createBulk(request: Request, response: Response): Promise<Response> {
    requireAuthenticatedUserId(request);
    const { fields } = request.body as { fields: FieldInput[] };
    if (!Array.isArray(fields) || fields.length === 0) {
      throw AppError.badRequest('Missing required fields', 'MISSING_FIELDS');
    }
    const entities = fields.map((field) => this.buildField(field, false));
    await this.repository.createMany(entities);
    return response.status(201).json({ status: 'success', data: { count: entities.length } });
  }

  async findById(request: Request, response: Response): Promise<Response> {
    const field = await this.repository.findById(request.params.id);
    if (!field) throw AppError.notFound('Field not found', 'FIELD_NOT_FOUND');
    return response.json({ status: 'success', data: { field } });
  }

  async listByCompany(request: Request, response: Response): Promise<Response> {
    const fields = await this.repository.findManyByCompanyId(request.params.companyId);
    return response.json({ status: 'success', data: { fields } });
  }

  async listForCurrentUser(request: Request, response: Response): Promise<Response> {
    const fields = await this.repository.findManyByUserId(requireAuthenticatedUserId(request));
    return response.json({ status: 'success', data: { fields } });
  }

  async update(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;
    if (!(await this.repository.findById(id))) {
      throw AppError.notFound('Field not found', 'FIELD_NOT_FOUND');
    }
    const field = await this.repository.update(id, request.body as Partial<Field>);
    return response.json({ status: 'success', data: { field } });
  }

  async updateBulk(request: Request, response: Response): Promise<Response> {
    requireAuthenticatedUserId(request);
    const { fields } = request.body as {
      fields: Array<{ id: string } & Partial<Field>>;
    };
    if (!Array.isArray(fields) || fields.length === 0) {
      throw AppError.badRequest('Missing fields array', 'MISSING_FIELDS');
    }
    const invalidIndex = fields.findIndex((field) => !field.id);
    if (invalidIndex !== -1) {
      throw AppError.badRequest(`Missing id in fields[${invalidIndex}]`, 'MISSING_FIELD_ID');
    }
    const updates = fields.map(({ id, ...data }) => ({ id, data }));
    const count = await this.repository.updateMany(updates);
    return response.json({ status: 'success', data: { count } });
  }

  async delete(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;
    if (!(await this.repository.findById(id))) {
      throw AppError.notFound('Field not found', 'FIELD_NOT_FOUND');
    }
    await this.repository.delete(id);
    return response.status(204).send();
  }

  async deleteBulk(request: Request, response: Response): Promise<Response> {
    requireAuthenticatedUserId(request);
    if (!this.deleteBulkUseCase) {
      throw AppError.badRequest(
        'DeleteFieldsBulkUseCase not configured',
        'USE_CASE_NOT_CONFIGURED',
      );
    }
    const { ids } = request.body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      throw AppError.badRequest('Missing ids array', 'MISSING_IDS');
    }
    await this.deleteBulkUseCase.execute({ ids });
    return response.status(204).send();
  }

  async listAvailabilityByCompanies(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    if (!this.availabilityUseCase) {
      throw AppError.badRequest(
        'GetFieldsAvailabilityUseCase not configured',
        'USE_CASE_NOT_CONFIGURED',
      );
    }
    const startAt = request.query.startAt
      ? new Date(request.query.startAt as string)
      : undefined;
    const endAt = request.query.endAt ? new Date(request.query.endAt as string) : undefined;
    const companies = await this.availabilityUseCase.execute({ userId, startAt, endAt });
    return response.json({ status: 'success', data: { companies } });
  }

  private buildField(input: FieldInput, requireAddress: boolean): Field {
    if (
      !input.name ||
      (requireAddress && !input.address) ||
      !input.foglio ||
      !input.particella ||
      typeof input.superficieCatastaleMq === 'undefined'
    ) {
      throw AppError.badRequest(
        requireAddress ? 'Missing required fields' : 'Missing required fields in one or more fields',
        'MISSING_FIELDS',
      );
    }
    const dates = resolveFieldConductionDates(input.inizioConduzione, input.fineConduzione);
    return Field.create({
      companyId: input.companyId || null,
      sourceFileId: input.sourceFileId ?? null,
      name: input.name,
      coordinates: input.coordinates ?? [],
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      polygon: input.polygon ?? null,
      gisHa: input.gisHa ?? null,
      sauHa:
        resolveFieldSauHa(input.sauHa, input.gisHa, input.superficieCatastaleMq) ?? null,
      ph: input.ph ?? null,
      nitrogen: input.nitrogen ?? null,
      phosphorus: input.phosphorus ?? null,
      potassium: input.potassium ?? null,
      calcium: input.calcium ?? null,
      magnesium: input.magnesium ?? null,
      soilType: input.soilType ?? null,
      uso: input.uso ?? null,
      qualita: input.qualita ?? null,
      superficieCatastaleMq: input.superficieCatastaleMq,
      sezione: input.sezione?.trim() || 'UNSPECIFIED',
      foglio: input.foglio,
      particella: input.particella,
      subalterno: input.subalterno ?? null,
      nation: input.nation ?? null,
      region: input.region ?? null,
      city: input.city ?? null,
      address: input.address?.trim() || 'N/A',
      cap: input.cap ?? null,
      variazioneMq: input.variazioneMq ?? null,
      inizioConduzione: dates.inizioConduzione,
      fineConduzione: dates.fineConduzione,
      bufferZoneNotes: null,
    });
  }
}

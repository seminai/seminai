import { Request, Response } from 'express';
import { DeleteFieldsBulkUseCase } from '../../../application/use-cases/field/DeleteFieldsBulkUseCase';
import { GetFieldsAvailabilityUseCase } from '../../../application/use-cases/field/GetFieldsAvailabilityUseCase';
import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { FieldCrudController } from './FieldCrudController';
import { FieldExtractionController } from './FieldExtractionController';

/** Preserves the field route contract while delegating focused responsibilities. */
export class FieldController {
  private readonly crud: FieldCrudController;
  private readonly extraction: FieldExtractionController;

  constructor(
    fieldRepository: IFieldRepository,
    getFieldsAvailabilityUseCase?: GetFieldsAvailabilityUseCase,
    deleteBulkUseCase?: DeleteFieldsBulkUseCase,
  ) {
    this.crud = new FieldCrudController(
      fieldRepository,
      getFieldsAvailabilityUseCase,
      deleteBulkUseCase,
    );
    this.extraction = new FieldExtractionController();
  }

  async create(request: Request, response: Response): Promise<Response> {
    return this.crud.create(request, response);
  }

  async createBulk(request: Request, response: Response): Promise<Response> {
    return this.crud.createBulk(request, response);
  }

  async findById(request: Request, response: Response): Promise<Response> {
    return this.crud.findById(request, response);
  }

  async listByCompany(request: Request, response: Response): Promise<Response> {
    return this.crud.listByCompany(request, response);
  }

  async listForCurrentUser(request: Request, response: Response): Promise<Response> {
    return this.crud.listForCurrentUser(request, response);
  }

  async update(request: Request, response: Response): Promise<Response> {
    return this.crud.update(request, response);
  }

  async updateBulk(request: Request, response: Response): Promise<Response> {
    return this.crud.updateBulk(request, response);
  }

  async delete(request: Request, response: Response): Promise<Response> {
    return this.crud.delete(request, response);
  }

  async deleteBulk(request: Request, response: Response): Promise<Response> {
    return this.crud.deleteBulk(request, response);
  }

  async listAvailabilityByCompanies(request: Request, response: Response): Promise<Response> {
    return this.crud.listAvailabilityByCompanies(request, response);
  }

  async startExtractionJob(request: Request, response: Response): Promise<Response> {
    return this.extraction.startJob(request, response);
  }

  async getExtractionJobStatus(request: Request, response: Response): Promise<Response> {
    return this.extraction.getJobStatus(request, response);
  }

  async extractOnly(request: Request, response: Response): Promise<Response> {
    return this.extraction.extractOnly(request, response);
  }
}

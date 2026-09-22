import { Request, Response } from 'express';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { AppError } from '../../../domain/errors/AppError';
import { Warehouse } from '../../../domain/entities/Warehouse';
import { ResourceAccessGuard } from '../../../application/use-cases/access/ResourceAccessGuard';

export class WarehouseController {
  constructor(
    private readonly warehouseRepository: IWarehouseRepository,
    private readonly accessGuard: ResourceAccessGuard,
  ) {}

  private requireUser(request: Request): string {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    return request.user.id;
  }

  async create(request: Request, response: Response): Promise<Response> {
    const body = request.body as {
      companyId?: string;
      name?: string;
      nation?: string | null;
      region?: string | null;
      city?: string | null;
      address?: string;
      cap?: string | null;
      sezione?: string;
      foglio?: string;
      particella?: string;
      subalterno?: string | null;
    };
    const {
      companyId,
      name,
      nation = null,
      region = null,
      city = null,
      address = '',
      cap = null,
      sezione = '',
      foglio = '',
      particella = '',
      subalterno = null,
    } = body;

    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    if (!companyId || !name) {
      throw AppError.badRequest('Missing required fields: companyId and name', 'MISSING_FIELDS');
    }

    const entity = Warehouse.create({
      companyId,
      name,
      nation,
      region,
      city,
      address,
      cap,
      sezione,
      foglio,
      particella,
      subalterno,
    });

    const created = await this.warehouseRepository.create(entity);

    return response.status(201).json({ status: 'success', data: { warehouse: created } });
  }

  async findById(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;
    const warehouse = await this.accessGuard.assertWarehouse(userId, id);
    return response.json({ status: 'success', data: { warehouse } });
  }

  async listByCompany(request: Request, response: Response): Promise<Response> {
    const { companyId } = request.params;
    const list = await this.warehouseRepository.findManyByCompanyId(companyId);
    return response.json({ status: 'success', data: { warehouses: list } });
  }

  async update(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;
    await this.accessGuard.assertWarehouse(userId, id);
    const updateData = request.body as Partial<Warehouse>;

    const updated = await this.warehouseRepository.update(id, updateData);
    return response.json({ status: 'success', data: { warehouse: updated } });
  }

  async delete(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;
    await this.accessGuard.assertWarehouse(userId, id);
    await this.warehouseRepository.delete(id);
    return response.status(204).send();
  }
}

import { Warehouse } from '../../../domain/entities/Warehouse';
import { AppError } from '../../../domain/errors/AppError';
import type { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';

export async function resolveProductImportWarehouse(
  repository: IWarehouseRepository,
  companyId: string,
  warehouseId?: string,
): Promise<string> {
  if (warehouseId) {
    await assertWarehouseCompany(repository, companyId, warehouseId);
    return warehouseId;
  }
  const warehouses = await repository.findManyByCompanyId(companyId);
  if (warehouses.length > 0) return warehouses[0].id;
  const warehouse = Warehouse.create({
    companyId,
    name: 'Magazzino Principale',
    address: 'N/A',
    nation: null,
    region: null,
    city: null,
    cap: null,
    sezione: 'N/A',
    foglio: 'N/A',
    particella: 'N/A',
    subalterno: null,
  });
  return (await repository.create(warehouse)).id;
}

export async function assertWarehouseCompany(
  repository: IWarehouseRepository,
  companyId: string,
  warehouseId: string,
): Promise<void> {
  const warehouse = await repository.findById(warehouseId);
  if (!warehouse) throw AppError.notFound('Warehouse not found', 'WAREHOUSE_NOT_FOUND');
  if (warehouse.companyId !== companyId) {
    throw AppError.badRequest(
      'Warehouse does not belong to the specified company',
      'WAREHOUSE_COMPANY_MISMATCH',
    );
  }
}

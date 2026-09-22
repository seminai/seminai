import { Warehouse } from '../entities/Warehouse';

/**
 * Repository port for Warehouse persistence operations.
 */
export interface IWarehouseRepository {
  create(warehouse: Warehouse): Promise<Warehouse>;
  findById(id: string): Promise<Warehouse | null>;
  findManyByCompanyId(companyId: string): Promise<Warehouse[]>;
  update(id: string, data: Partial<Warehouse>): Promise<Warehouse>;
  delete(id: string): Promise<void>;
}

import { Machine } from '../entities/Machine';

/**
 * Repository port for Machine persistence operations.
 */
export interface IMachineRepository {
  createMany(machines: Machine[]): Promise<void>;
  findById(id: string): Promise<Machine | null>;
  findManyByCompanyId(companyId: string): Promise<Machine[]>;
  update(id: string, data: Partial<Machine>): Promise<Machine>;
  deleteMany(ids: string[]): Promise<void>;
}

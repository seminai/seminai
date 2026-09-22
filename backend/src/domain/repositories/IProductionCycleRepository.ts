import { ProductionCycle } from '../entities/ProductionCycle';

export interface IProductionCycleRepository {
  /**
   * Create a new production cycle.
   */
  create(cycle: ProductionCycle): Promise<ProductionCycle>;

  /**
   * Find a cycle by its ID.
   */
  findById(id: string): Promise<ProductionCycle | null>;

  /**
   * Find all cycles for a production unit, ordered by seasonYear and cycleIndex.
   */
  findManyByProductionUnitId(productionUnitId: string): Promise<ProductionCycle[]>;

  /**
   * Update a cycle by ID.
   */
  update(id: string, data: Partial<ProductionCycle>): Promise<ProductionCycle>;

  /**
   * Delete a cycle by ID.
   */
  delete(id: string): Promise<void>;

  /**
   * Count cycles for a production unit.
   */
  countByProductionUnitId(productionUnitId: string): Promise<number>;

  /**
   * Get the next cycle index for a production unit in a given year.
   */
  getNextCycleIndex(productionUnitId: string, seasonYear: number): Promise<number>;
}

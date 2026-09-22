import { PrismaClient } from '@prisma/client';
import { ProductionUnitMetadata, ProductionUnitWithCycles, batchLoadProductionUnitMetadata, batchLoadProductionUnitsWithCycles } from './batchLoader.part-01-multi-annual-threshold-days';
import { ensureWarehouseForCompany, resolveCycleIdFromCache } from './batchLoader.part-02-resolve-cycle-id-from-cache';

/**
 * BatchLoaderContext holds pre-fetched data for the entire fillTheJob operation.
 */
export class BatchLoaderContext {
  private unitsWithCycles: Map<string, ProductionUnitWithCycles> = new Map();
  private unitMetadata: Map<string, ProductionUnitMetadata> = new Map();
  private warehouseCreationAttempts: Set<string> = new Set();
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Initialize the context by pre-loading all required data.
   */
  async initialize(unitIds: ReadonlyArray<string>): Promise<void> {
    const [unitsWithCycles, unitMetadata] = await Promise.all([
      batchLoadProductionUnitsWithCycles(this.prisma, unitIds),
      batchLoadProductionUnitMetadata(this.prisma, unitIds),
    ]);

    this.unitsWithCycles = unitsWithCycles;
    this.unitMetadata = unitMetadata;

    console.log(
      `[BATCH-LOADER] Initialized with ${this.unitsWithCycles.size} units, ${this.unitMetadata.size} metadata entries`,
    );
  }

  getUnitWithCycles(unitId: string): ProductionUnitWithCycles | undefined {
    return this.unitsWithCycles.get(unitId);
  }

  getUnitMetadata(unitId: string): ProductionUnitMetadata | undefined {
    return this.unitMetadata.get(unitId);
  }

  /**
   * Get or create warehouse for a company.
   * Ensures warehouse creation is only attempted once per company.
   */
  async getOrCreateWarehouse(companyId: string | null): Promise<string | null> {
    if (!companyId) return null;

    // Check if we already have it in metadata
    for (const metadata of this.unitMetadata.values()) {
      if (metadata.companyId === companyId && metadata.warehouseId) {
        return metadata.warehouseId;
      }
    }

    // Avoid multiple creation attempts for the same company
    if (this.warehouseCreationAttempts.has(companyId)) {
      return null;
    }
    this.warehouseCreationAttempts.add(companyId);

    const warehouseId = await ensureWarehouseForCompany(this.prisma, companyId);

    // Update metadata cache if warehouse was created
    if (warehouseId) {
      for (const [unitId, metadata] of this.unitMetadata.entries()) {
        if (metadata.companyId === companyId) {
          this.unitMetadata.set(unitId, { ...metadata, warehouseId });
        }
      }
    }

    return warehouseId;
  }

  /**
   * Resolve cycle ID using cached data.
   */
  resolveCycleId(unitId: string, providedCycleId?: string, treatmentDate?: Date): string | null {
    const unitData = this.unitsWithCycles.get(unitId);
    return resolveCycleIdFromCache(unitData, providedCycleId, treatmentDate);
  }
}

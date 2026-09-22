/**
 * Batch loader utilities to prevent N+1 query patterns.
 * Pre-fetches data in bulk instead of making individual queries per item.
 */

import { PrismaClient, ProductionCycle } from '@prisma/client';

const MULTI_ANNUAL_THRESHOLD_DAYS = 370; // ~1 year
const DEFAULT_WAREHOUSE_ID_PREFIX = 'default-warehouse';

export interface ProductionUnitWithCycles {
  readonly id: string;
  readonly name: string | null;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly cycles: ReadonlyArray<ProductionCycle>;
}

export interface ProductionUnitMetadata {
  readonly productionUnitId: string;
  readonly productionUnitName: string | null;
  readonly companyId: string | null;
  readonly companyName: string | null;
  readonly warehouseId: string | null;
}

/**
 * Batch load all production units with their cycles for a given set of unit IDs.
 * Returns a Map for O(1) lookup.
 */
export async function batchLoadProductionUnitsWithCycles(
  prisma: PrismaClient,
  unitIds: ReadonlyArray<string>,
): Promise<Map<string, ProductionUnitWithCycles>> {
  if (unitIds.length === 0) {
    return new Map();
  }

  const uniqueIds = [...new Set(unitIds)];

  const units = await prisma.productionUnit.findMany({
    where: { id: { in: uniqueIds } },
    include: {
      cycles: {
        orderBy: [{ seasonYear: 'asc' }, { cycleIndex: 'asc' }],
      },
    },
  });

  const map = new Map<string, ProductionUnitWithCycles>();
  for (const unit of units) {
    map.set(unit.id, {
      id: unit.id,
      name: unit.name,
      startDate: unit.startDate,
      endDate: unit.endDate,
      cycles: unit.cycles,
    });
  }

  return map;
}

/**
 * Batch load metadata for production units including company and warehouse info.
 * Returns a Map for O(1) lookup.
 */
export async function batchLoadProductionUnitMetadata(
  prisma: PrismaClient,
  unitIds: ReadonlyArray<string>,
): Promise<Map<string, ProductionUnitMetadata>> {
  if (unitIds.length === 0) {
    return new Map();
  }

  const uniqueIds = [...new Set(unitIds)];

  const units = await prisma.productionUnit.findMany({
    where: { id: { in: uniqueIds } },
    include: {
      productionUnitsOnFields: {
        include: {
          field: {
            select: {
              companyId: true,
              company: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // Collect company IDs for warehouse lookup
  const companyIds = new Set<string>();
  const unitCompanyMap = new Map<
    string,
    { companyId: string | null; companyName: string | null }
  >();

  for (const unit of units) {
    const firstRelation = unit.productionUnitsOnFields.find(
      (relation) => relation.field?.companyId,
    );
    const companyId = firstRelation?.field?.companyId ?? null;
    const companyName = firstRelation?.field?.company?.name ?? null;

    unitCompanyMap.set(unit.id, { companyId, companyName });
    if (companyId) {
      companyIds.add(companyId);
    }
  }

  // Batch load warehouses for all companies
  const warehouseMap = new Map<string, string>();
  if (companyIds.size > 0) {
    const warehouses = await prisma.warehouse.findMany({
      where: { companyId: { in: [...companyIds] } },
      select: { id: true, companyId: true },
    });

    // Store first warehouse per company
    for (const warehouse of warehouses) {
      if (!warehouseMap.has(warehouse.companyId)) {
        warehouseMap.set(warehouse.companyId, warehouse.id);
      }
    }
  }

  // Build final metadata map
  const map = new Map<string, ProductionUnitMetadata>();
  for (const unit of units) {
    const companyInfo = unitCompanyMap.get(unit.id);
    const warehouseId = companyInfo?.companyId
      ? warehouseMap.get(companyInfo.companyId) ?? null
      : null;

    map.set(unit.id, {
      productionUnitId: unit.id,
      productionUnitName: unit.name,
      companyId: companyInfo?.companyId ?? null,
      companyName: companyInfo?.companyName ?? null,
      warehouseId,
    });
  }

  return map;
}

/**
 * Resolve cycle ID for a production unit using pre-loaded data.
 * This replaces the individual query in resolveCycleId.
 */
export function resolveCycleIdFromCache(
  unitData: ProductionUnitWithCycles | undefined,
  providedCycleId: string | undefined,
  treatmentDate?: Date,
): string | null {
  if (providedCycleId) {
    return providedCycleId;
  }

  if (!unitData || unitData.cycles.length === 0) {
    return null;
  }

  const conductionStart = unitData.startDate;
  const conductionEnd = unitData.endDate;
  const allCycles = unitData.cycles;

  // Check if multi-annual
  const diffMilliseconds = conductionEnd.getTime() - conductionStart.getTime();
  const diffDays = diffMilliseconds / (1000 * 60 * 60 * 24);
  const isMultiAnnual = diffDays > MULTI_ANNUAL_THRESHOLD_DAYS;

  // Filter cycles in range
  const cyclesInRange = allCycles.filter((cycle) => {
    const harvestingDate = cycle.harvestingDate;
    if (!harvestingDate) return false;
    return harvestingDate >= conductionStart && harvestingDate <= conductionEnd;
  });
  const effectiveCycles = cyclesInRange.length > 0 ? cyclesInRange : [...allCycles];

  // Sort by flowering/harvest date
  const sortedCycles = effectiveCycles.sort((a, b) => {
    const aKey = a.floweringDate?.getTime() ?? a.harvestingDate?.getTime() ?? 0;
    const bKey = b.floweringDate?.getTime() ?? b.harvestingDate?.getTime() ?? 0;
    return aKey - bKey;
  });

  if (!isMultiAnnual) {
    // Annual crops: use the first cycle (or cycle matching treatment date year)
    if (treatmentDate) {
      const treatmentYear = treatmentDate.getFullYear();
      const cycleForYear = sortedCycles.find((c) => c.seasonYear === treatmentYear);
      if (cycleForYear) {
        return cycleForYear.id;
      }
    }
    return sortedCycles[0]?.id ?? null;
  }

  // Multi-annual: pick cycle nearest to treatment date or today
  const targetDate = treatmentDate ?? new Date();
  let bestCycle = sortedCycles[0];
  const firstHarvestTime = sortedCycles[0]?.harvestingDate?.getTime() ?? targetDate.getTime();
  let bestDiff = Math.abs(firstHarvestTime - targetDate.getTime());

  for (const cycle of sortedCycles.slice(1)) {
    const harvestTime = cycle.harvestingDate?.getTime() ?? targetDate.getTime();
    const diff = Math.abs(harvestTime - targetDate.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      bestCycle = cycle;
    }
  }

  return bestCycle?.id ?? null;
}

/**
 * Create default warehouse for company if it doesn't exist.
 * Returns the warehouse ID.
 */
export async function ensureWarehouseForCompany(
  prisma: PrismaClient,
  companyId: string,
): Promise<string | null> {
  // First check if warehouse exists
  const existing = await prisma.warehouse.findFirst({
    where: { companyId },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const defaultWarehouseId = `${DEFAULT_WAREHOUSE_ID_PREFIX}-${companyId}`;

  // Create default warehouse
  try {
    const newWarehouse = await prisma.warehouse.create({
      data: {
        id: defaultWarehouseId,
        companyId,
        name: 'Magazzino Principale',
        address: 'N/A',
        sezione: 'N/A',
        foglio: 'N/A',
        particella: 'N/A',
      },
    });
    console.log(
      `[BATCH-LOADER] Created default warehouse for company ${companyId}: ${newWarehouse.id}`,
    );
    return newWarehouse.id;
  } catch (error) {
    const createdDefaultWarehouse = await prisma.warehouse.findUnique({
      where: { id: defaultWarehouseId },
      select: { id: true },
    });
    if (createdDefaultWarehouse) {
      return createdDefaultWarehouse.id;
    }
    const fallbackExisting = await prisma.warehouse.findFirst({
      where: { companyId },
      select: { id: true },
    });
    if (fallbackExisting) {
      return fallbackExisting.id;
    }
    console.error(
      `[BATCH-LOADER] Failed to create default warehouse for company ${companyId}:`,
      error,
    );
    return null;
  }
}

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

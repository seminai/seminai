import { PrismaClient, ProductionCycle } from '@prisma/client';

export const MULTI_ANNUAL_THRESHOLD_DAYS = 370;

// ~1 year
export const DEFAULT_WAREHOUSE_ID_PREFIX = 'default-warehouse';

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

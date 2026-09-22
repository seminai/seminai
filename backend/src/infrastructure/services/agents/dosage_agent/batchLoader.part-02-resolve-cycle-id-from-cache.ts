import { PrismaClient } from '@prisma/client';
import { DEFAULT_WAREHOUSE_ID_PREFIX, MULTI_ANNUAL_THRESHOLD_DAYS, ProductionUnitWithCycles } from './batchLoader.part-01-multi-annual-threshold-days';

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

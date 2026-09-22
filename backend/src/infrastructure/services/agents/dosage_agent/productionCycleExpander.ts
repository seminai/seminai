import { ProductionCycle } from '@prisma/client';
import { prisma, withRetry } from '../../../repositories/Prisma';
import type { RawUnitOfProduction } from './types';
import { normalizeAreaHa } from '../../../utils/area-normalization';

const MULTI_ANNUAL_THRESHOLD_DAYS = 370; // ~1 year

function isMultiAnnual(conductionStart: Date, conductionEnd: Date): boolean {
  const diffMilliseconds = conductionEnd.getTime() - conductionStart.getTime();
  const diffDays = diffMilliseconds / (1000 * 60 * 60 * 24);
  return diffDays > MULTI_ANNUAL_THRESHOLD_DAYS;
}

function filterCyclesInRange(
  cycles: ProductionCycle[],
  startDate: Date,
  endDate: Date,
): ProductionCycle[] {
  return cycles.filter((cycle) => {
    const harvestingDate = cycle.harvestingDate;
    if (!harvestingDate) return false;
    return harvestingDate >= startDate && harvestingDate <= endDate;
  });
}

function sortCyclesByFloweringAndHarvest(cycles: ProductionCycle[]): ProductionCycle[] {
  return [...cycles].sort((a, b) => {
    const aKey = a.floweringDate?.getTime() ?? a.harvestingDate?.getTime() ?? 0;
    const bKey = b.floweringDate?.getTime() ?? b.harvestingDate?.getTime() ?? 0;
    return aKey - bKey;
  });
}

function pickCycleNearestToDate(
  cycles: ProductionCycle[],
  targetDate: Date,
): ProductionCycle | null {
  if (cycles.length === 0) {
    return null;
  }
  let bestCycle: ProductionCycle = cycles[0];
  const firstHarvestTime = cycles[0].harvestingDate?.getTime() ?? targetDate.getTime();
  let bestDiff = Math.abs(firstHarvestTime - targetDate.getTime());
  for (const cycle of cycles.slice(1)) {
    const harvestTime = cycle.harvestingDate?.getTime() ?? targetDate.getTime();
    const diff = Math.abs(harvestTime - targetDate.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      bestCycle = cycle;
    }
  }
  return bestCycle;
}

export async function expandUnitOfProductionWithCycles(
  units: RawUnitOfProduction[],
): Promise<RawUnitOfProduction[]> {
  // OPTIMIZATION: Batch query instead of N sequential queries
  // Collect all unit IDs first
  const unitIdMap = new Map<string, RawUnitOfProduction>();
  const unitsWithoutId: RawUnitOfProduction[] = [];

  for (const unit of units) {
    const rawId =
      (unit as { id?: string; idApp?: string }).id ??
      (unit as { idApp?: string }).idApp ??
      undefined;
    const unitId = typeof rawId === 'string' ? rawId.trim() : '';
    if (!unitId) {
      unitsWithoutId.push(unit);
    } else {
      unitIdMap.set(unitId, unit);
    }
  }

  // Single batch query for all units (with retry on pool timeout)
  const unitIds = Array.from(unitIdMap.keys());
  const unitRecords =
    unitIds.length > 0
      ? await withRetry(() =>
          prisma.productionUnit.findMany({
            where: { id: { in: unitIds } },
            include: {
              cycles: {
                orderBy: [{ seasonYear: 'asc' }, { cycleIndex: 'asc' }],
              },
              productionUnitsOnFields: {
                select: {
                  areaHaOnField: true,
                  field: {
                    select: {
                      superficieCatastaleMq: true,
                    },
                  },
                },
              },
            },
          }),
        )
      : [];

  // Build lookup map from records
  const recordsMap = new Map(unitRecords.map((r) => [r.id, r]));
  console.log(
    `[EXPAND-CYCLES] Batch loaded ${unitRecords.length} production units (${unitIds.length} requested)`,
  );

  const expanded: RawUnitOfProduction[] = [...unitsWithoutId];

  for (const [unitId, unit] of unitIdMap) {
    const unitRecord = recordsMap.get(unitId);

    if (!unitRecord) {
      expanded.push(unit);
      continue;
    }

    const conductionStart: Date = unitRecord.startDate;
    const conductionEnd: Date = unitRecord.endDate;
    const allCycles: ProductionCycle[] = unitRecord.cycles;

    if (allCycles.length === 0) {
      // No explicit cycles: fall back to a single entry using unit conduction dates
      expanded.push({
        ...unit,
        id: unitId,
        startDate: conductionStart,
        endDate: conductionEnd,
      } as RawUnitOfProduction);
      continue;
    }

    const cyclesInRange = filterCyclesInRange(allCycles, conductionStart, conductionEnd);
    const effectiveCycles = cyclesInRange.length > 0 ? cyclesInRange : allCycles;
    const sortedCycles = sortCyclesByFloweringAndHarvest(effectiveCycles);

    const multiAnnual = isMultiAnnual(conductionStart, conductionEnd);
    const cyclesToUse: ProductionCycle[] = [];

    if (!multiAnnual) {
      // Annual or short-duration crops: use all cycles in range (e.g. multi-cut forage)
      cyclesToUse.push(...sortedCycles);
    } else {
      // Multi-annual (orchards, perennial crops): use the cycle closest to today
      const target = pickCycleNearestToDate(sortedCycles, new Date());
      if (target) {
        cyclesToUse.push(target);
      }
    }

    const referenceAreaSqm = unitRecord.productionUnitsOnFields.reduce((sum, allocation) => {
      const fieldAreaSqm = allocation.field.superficieCatastaleMq;
      return (
        sum + (typeof fieldAreaSqm === 'number' && Number.isFinite(fieldAreaSqm) ? fieldAreaSqm : 0)
      );
    }, 0);
    const areaHa =
      normalizeAreaHa(unitRecord.areaHa, {
        referenceAreaSqm: referenceAreaSqm > 0 ? referenceAreaSqm : undefined,
      }) ?? unitRecord.areaHa;

    for (const cycle of cyclesToUse) {
      expanded.push({
        ...unit,
        id: unitId,
        cycleId: cycle.id,
        cropName: cycle.cropName,
        cropType: cycle.cropType,
        variety: cycle.variety,
        protocoll: cycle.protocoll,
        areaHa,
        protectionStructure: cycle.protectionStructure,
        startDate: conductionStart,
        floweringDate: cycle.floweringDate,
        harvestingDate: cycle.harvestingDate,
        endDate: conductionEnd,
        occupazione: cycle.occupazione,
        destinazioneDiUso: cycle.destinazioneDiUso,
        acquaTotalePeridoL: cycle.acquaTotalePeridoL,
        seasonYear: cycle.seasonYear,
        cycleIndex: cycle.cycleIndex,
      } as RawUnitOfProduction);
    }
  }
  return expanded;
}

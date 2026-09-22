import { PrismaClient, Product, ProductionCycle } from '@prisma/client';
import {
  FertilizerInput,
  PublicPlanResult,
  SoilFactors,
} from '../../../domain/entities/fertilizer-plan/types';
import { sanitizePlan } from '../../../domain/entities/fertilizer-plan/plan-sanitizer';
import { calculateFertilizationPlan } from '../../../infrastructure/services/fertilizer/fertilizer-optimizer';
import { loadCropRequirements } from '../../../infrastructure/services/fertilizer/crop-requirements-loader';
import { getDefaultYield } from '../../../infrastructure/services/fertilizer/yield-loader';

export interface ComputeFertilizerPlanInput {
  readonly productionUnitIds: readonly string[];
  readonly fertilizerProductIds?: readonly string[];
  /**
   * Optional map of `{ productionUnitId: actualYieldTonsPerHa }` used to scale the
   * plan to the user's expected yield. When omitted (or the unit is missing),
   * the optimizer uses the CSV's calibration yield as-is (yieldScale = 1).
   */
  readonly actualYieldByUnitId?: Readonly<Record<string, number>>;
  readonly irrigation?: number;
  readonly soilFactors?: SoilFactors;
}

export interface UnitPlanOutput {
  readonly unitId: string;
  readonly unitName: string;
  readonly cropName: string;
  readonly plan: PublicPlanResult | null;
  readonly fertilizerNamesById: Readonly<Record<string, string>>;
  readonly skipped: boolean;
  readonly skippedReason?: string;
}

export interface ComputeFertilizerPlanOutput {
  readonly unitsProcessed: number;
  readonly plans: readonly UnitPlanOutput[];
}

/**
 * Orchestrates the fertilization plan computation for one or more production units.
 *
 * Privacy contract: this use case is the ONLY consumer of the private CSV loaders
 * and of `calculateFertilizationPlan`. The output is `PublicPlanResult` (already
 * sanitized) so the agent layer can consume it directly.
 */
export class ComputeFertilizerPlanUseCase {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(input: ComputeFertilizerPlanInput): Promise<ComputeFertilizerPlanOutput> {
    const irrigation = input.irrigation ?? 1;
    const units = await this.loadUnits(input.productionUnitIds);
    const fertilizers = await this.loadFertilizers(input, units);
    const plans = await Promise.all(
      units.map((unit) =>
        this.computeUnitPlan(
          unit,
          fertilizers,
          irrigation,
          input.soilFactors,
          input.actualYieldByUnitId?.[unit.id],
        ),
      ),
    );
    return { unitsProcessed: plans.length, plans };
  }

  private async loadFertilizers(
    input: ComputeFertilizerPlanInput,
    units: ReadonlyArray<{ id: string }>,
  ): Promise<readonly FertilizerInput[]> {
    const explicitIds = input.fertilizerProductIds;
    if (explicitIds && explicitIds.length > 0) {
      const products = await this.prisma.product.findMany({
        where: { id: { in: [...explicitIds] }, category: 'FERTILIZER' },
      });
      return products.map(toFertilizerInput).filter(hasAnyNutrient);
    }
    const companyIds = await this.resolveCompanyIds(units.map((u) => u.id));
    if (companyIds.length === 0) return [];
    const products = await this.prisma.product.findMany({
      where: {
        category: 'FERTILIZER',
        warehouse: { companyId: { in: companyIds } },
      },
    });
    return products.map(toFertilizerInput).filter(hasAnyNutrient);
  }

  private async resolveCompanyIds(productionUnitIds: readonly string[]): Promise<string[]> {
    const links = await this.prisma.productionUnitOnField.findMany({
      where: { productionUnitId: { in: [...productionUnitIds] } },
      include: { field: { select: { companyId: true } } },
    });
    const set = new Set<string>();
    for (const link of links) {
      if (link.field.companyId) set.add(link.field.companyId);
    }
    return [...set];
  }

  private async loadUnits(productionUnitIds: readonly string[]) {
    return this.prisma.productionUnit.findMany({
      where: { id: { in: [...productionUnitIds] } },
      include: {
        cycles: { orderBy: [{ seasonYear: 'desc' }, { cycleIndex: 'desc' }], take: 1 },
      },
    });
  }

  private async computeUnitPlan(
    unit: { id: string; name: string; cycles: ProductionCycle[] },
    fertilizers: readonly FertilizerInput[],
    irrigation: number,
    soilFactors: SoilFactors | undefined,
    actualYield: number | undefined,
  ): Promise<UnitPlanOutput> {
    const activeCycle = unit.cycles[0];
    const fertilizerNamesById = buildNameMap(fertilizers);
    if (!activeCycle) {
      return skip(unit, '', fertilizerNamesById, 'No production cycle found for the unit');
    }
    if (fertilizers.length === 0) {
      return skip(
        unit,
        activeCycle.cropName,
        fertilizerNamesById,
        'No fertilizer products with nutrient composition available',
      );
    }
    const { weeks, resolved } = await loadCropRequirements(activeCycle.cropName);
    if (weeks.length === 0) {
      return skip(unit, activeCycle.cropName, fertilizerNamesById, 'Crop requirement CSV is empty');
    }
    const yieldScale = await this.computeYieldScale(activeCycle.cropName, actualYield);
    const privatePlan = calculateFertilizationPlan({
      cropName: activeCycle.cropName,
      resolvedCropFile: resolved.filename,
      usedGenericFallback: resolved.usedGenericFallback,
      fertilizers,
      weeks,
      yieldScale,
      irrigation,
      soilFactors,
    });
    return {
      unitId: unit.id,
      unitName: unit.name,
      cropName: activeCycle.cropName,
      plan: sanitizePlan(privatePlan),
      fertilizerNamesById,
      skipped: false,
    };
  }

  /**
   * Computes the dimensionless yield multiplier applied to the per-day CSV demand.
   *
   * - If the caller did not provide an actualYield for the unit, returns 1.0
   *   (use the CSV calibration as-is — neutral behavior).
   * - Otherwise loads the reference yield (private, server-side only) and
   *   returns `actualYield / referenceYield`. The reference value never crosses
   *   the use-case boundary; only the ratio is exposed via the optimizer's
   *   PrivatePlanResult and ultimately stripped/transformed by the sanitizer.
   * - Falls back to 1.0 if the reference yield is zero or missing (defensive).
   */
  private async computeYieldScale(
    cropName: string,
    actualYield: number | undefined,
  ): Promise<number> {
    if (actualYield === undefined || actualYield <= 0) return 1;
    const referenceYield = await getDefaultYield(cropName);
    if (!Number.isFinite(referenceYield) || referenceYield <= 0) return 1;
    return actualYield / referenceYield;
  }
}

function buildNameMap(fertilizers: readonly FertilizerInput[]): Record<string, string> {
  return fertilizers.reduce<Record<string, string>>((acc, f) => {
    acc[f.id] = f.name;
    return acc;
  }, {});
}

function toFertilizerInput(product: Product): FertilizerInput {
  return {
    id: product.id,
    name: product.name,
    nitrogen: product.nitrogen ?? 0,
    phosphorus: product.phosphorus ?? 0,
    potassium: product.potassium ?? 0,
    magnesium: product.magnesium ?? 0,
    calcium: product.calcium ?? 0,
    sulfur: product.sulfur ?? 0,
    boron: product.boron ?? 0,
  };
}

function hasAnyNutrient(input: FertilizerInput): boolean {
  return (
    input.nitrogen > 0 ||
    input.phosphorus > 0 ||
    input.potassium > 0 ||
    input.magnesium > 0 ||
    input.calcium > 0 ||
    input.sulfur > 0 ||
    input.boron > 0
  );
}

function skip(
  unit: { id: string; name: string },
  cropName: string,
  fertilizerNamesById: Record<string, string>,
  reason: string,
): UnitPlanOutput {
  return {
    unitId: unit.id,
    unitName: unit.name,
    cropName,
    plan: null,
    fertilizerNamesById,
    skipped: true,
    skippedReason: reason,
  };
}

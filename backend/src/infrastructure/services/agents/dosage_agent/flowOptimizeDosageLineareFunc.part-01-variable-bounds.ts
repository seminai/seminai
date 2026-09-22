export interface VariableBounds {
  readonly min: number;
  readonly max: number;
  readonly target: number;
  readonly area: number;
}

export interface LPSolutionResult {
  readonly solution: { [key: string]: number };
  readonly totalRequired: number;
  readonly stockAvailable: number;
  readonly stockShortage: number;
  readonly hasStockShortage: boolean;
  readonly areaByUnitIndex?: { [unitIndex: number]: number };
  readonly areaAdjustmentSummary?: string;
  readonly stockResidual?: number;
  readonly hasStockResidual?: boolean;
}

export interface CurrentUnitAllocation {
  readonly unitIndex: number;
  readonly currentAreaHa: number;
  readonly maxAreaHa: number;
  readonly variableNames: ReadonlyArray<string>;
}

export const MIN_STOCK_EPSILON = 0.0001;

export function sumRequiredQuantity(
  solution: { [key: string]: number },
  variableBounds: { [key: string]: VariableBounds },
): number {
  return Object.keys(variableBounds).reduce((sum, variableName) => {
    const dose = solution[variableName] ?? 0;
    const area = variableBounds[variableName].area;
    return sum + dose * area;
  }, 0);
}

export function clampDose(value: number, bounds: VariableBounds): number {
  return Number(Math.max(bounds.min, Math.min(bounds.max, value)).toFixed(4));
}

export function buildCurrentStrategySolution(
  variableBounds: { [key: string]: VariableBounds },
  stockAvailable: number,
  unitsAllocation: ReadonlyArray<CurrentUnitAllocation>,
): LPSolutionResult {
  const variables = Object.keys(variableBounds);
  const solution: { [key: string]: number } = {};
  for (const variableName of variables) {
    solution[variableName] = clampDose(
      variableBounds[variableName].target,
      variableBounds[variableName],
    );
  }
  let totalRequired = sumRequiredQuantity(solution, variableBounds);
  if (totalRequired > stockAvailable + MIN_STOCK_EPSILON) {
    let shortageToRecover = totalRequired - stockAvailable;
    const adjustableDoseVariables = variables
      .map((variableName) => {
        const bounds = variableBounds[variableName];
        return {
          variableName,
          reducibleQuantity: (solution[variableName] - bounds.min) * bounds.area,
        };
      })
      .filter((entry) => entry.reducibleQuantity > MIN_STOCK_EPSILON);
    const totalReducibleDose = adjustableDoseVariables.reduce(
      (sum, entry) => sum + entry.reducibleQuantity,
      0,
    );
    if (totalReducibleDose > MIN_STOCK_EPSILON) {
      for (const entry of adjustableDoseVariables) {
        const bounds = variableBounds[entry.variableName];
        const desiredReduction = (entry.reducibleQuantity / totalReducibleDose) * shortageToRecover;
        const nextDose = solution[entry.variableName] - desiredReduction / bounds.area;
        solution[entry.variableName] = clampDose(nextDose, bounds);
      }
      totalRequired = sumRequiredQuantity(solution, variableBounds);
      shortageToRecover = Math.max(0, totalRequired - stockAvailable);
    }
    if (shortageToRecover > MIN_STOCK_EPSILON) {
      const areaByUnitIndex: { [unitIndex: number]: number } = {};
      for (const unitAllocation of unitsAllocation) {
        areaByUnitIndex[unitAllocation.unitIndex] = unitAllocation.currentAreaHa;
      }
      const consumptions = unitsAllocation
        .map((unitAllocation) => {
          const perHaConsumption = unitAllocation.variableNames.reduce((sum, variableName) => {
            return sum + (solution[variableName] ?? 0);
          }, 0);
          const currentConsumption = perHaConsumption * unitAllocation.currentAreaHa;
          return {
            unitIndex: unitAllocation.unitIndex,
            perHaConsumption,
            currentAreaHa: unitAllocation.currentAreaHa,
            currentConsumption,
          };
        })
        .filter(
          (entry) =>
            entry.perHaConsumption > MIN_STOCK_EPSILON && entry.currentAreaHa > MIN_STOCK_EPSILON,
        );
      const totalReducibleByArea = consumptions.reduce(
        (sum, entry) => sum + entry.currentConsumption,
        0,
      );
      if (totalReducibleByArea > MIN_STOCK_EPSILON) {
        for (const entry of consumptions) {
          const share = entry.currentConsumption / totalReducibleByArea;
          const quantityReduction = shortageToRecover * share;
          const areaReduction = quantityReduction / entry.perHaConsumption;
          const nextArea = Math.max(0, entry.currentAreaHa - areaReduction);
          areaByUnitIndex[entry.unitIndex] = Number(nextArea.toFixed(4));
          for (const variableName of variables) {
            if (variableName.startsWith(`u${entry.unitIndex}_`)) {
              variableBounds[variableName] = {
                ...variableBounds[variableName],
                area: Number(nextArea.toFixed(4)),
              };
            }
          }
        }
      }
      totalRequired = sumRequiredQuantity(solution, variableBounds);
      const stockShortage = Math.max(0, totalRequired - stockAvailable);
      const areaReducedUnits = consumptions.length;
      return {
        solution,
        totalRequired,
        stockAvailable,
        stockShortage,
        hasStockShortage: stockShortage > MIN_STOCK_EPSILON,
        areaByUnitIndex,
        areaAdjustmentSummary:
          areaReducedUnits > 0
            ? 'Area ridotta per rispettare lo stock disponibile (strategy=current).'
            : undefined,
      };
    }
  }
  if (totalRequired < stockAvailable - MIN_STOCK_EPSILON) {
    let residualToUse = stockAvailable - totalRequired;
    const expandableDoseVariables = variables
      .map((variableName) => {
        const bounds = variableBounds[variableName];
        return {
          variableName,
          expandableQuantity: (bounds.max - solution[variableName]) * bounds.area,
        };
      })
      .filter((entry) => entry.expandableQuantity > MIN_STOCK_EPSILON);
    const totalExpandableDose = expandableDoseVariables.reduce(
      (sum, entry) => sum + entry.expandableQuantity,
      0,
    );
    if (totalExpandableDose > MIN_STOCK_EPSILON) {
      const quantityToAssign = Math.min(residualToUse, totalExpandableDose);
      for (const entry of expandableDoseVariables) {
        const bounds = variableBounds[entry.variableName];
        const desiredIncrease = (entry.expandableQuantity / totalExpandableDose) * quantityToAssign;
        const nextDose = solution[entry.variableName] + desiredIncrease / bounds.area;
        solution[entry.variableName] = clampDose(nextDose, bounds);
      }
      totalRequired = sumRequiredQuantity(solution, variableBounds);
      residualToUse = Math.max(0, stockAvailable - totalRequired);
    }
    const areaByUnitIndex: { [unitIndex: number]: number } = {};
    for (const unitAllocation of unitsAllocation) {
      areaByUnitIndex[unitAllocation.unitIndex] = unitAllocation.currentAreaHa;
    }
    if (residualToUse > MIN_STOCK_EPSILON) {
      const expandableAreas = unitsAllocation
        .map((unitAllocation) => {
          const perHaConsumption = unitAllocation.variableNames.reduce((sum, variableName) => {
            return sum + (solution[variableName] ?? 0);
          }, 0);
          const maxExpandableArea = Math.max(
            0,
            unitAllocation.maxAreaHa - unitAllocation.currentAreaHa,
          );
          return {
            unitIndex: unitAllocation.unitIndex,
            perHaConsumption,
            maxExpandableArea,
          };
        })
        .filter(
          (entry) =>
            entry.perHaConsumption > MIN_STOCK_EPSILON &&
            entry.maxExpandableArea > MIN_STOCK_EPSILON,
        );
      const totalExpandableByArea = expandableAreas.reduce(
        (sum, entry) => sum + entry.perHaConsumption * entry.maxExpandableArea,
        0,
      );
      if (totalExpandableByArea > MIN_STOCK_EPSILON) {
        const quantityToAssign = Math.min(residualToUse, totalExpandableByArea);
        for (const entry of expandableAreas) {
          const share = (entry.perHaConsumption * entry.maxExpandableArea) / totalExpandableByArea;
          const quantityIncrease = quantityToAssign * share;
          const areaIncrease = Math.min(
            entry.maxExpandableArea,
            quantityIncrease / entry.perHaConsumption,
          );
          const nextArea = Number((areaByUnitIndex[entry.unitIndex] + areaIncrease).toFixed(4));
          areaByUnitIndex[entry.unitIndex] = nextArea;
          for (const variableName of variables) {
            if (variableName.startsWith(`u${entry.unitIndex}_`)) {
              variableBounds[variableName] = {
                ...variableBounds[variableName],
                area: nextArea,
              };
            }
          }
        }
      }
    }
    totalRequired = sumRequiredQuantity(solution, variableBounds);
    const stockResidual = Math.max(0, stockAvailable - totalRequired);
    const hasStockResidual = stockResidual > MIN_STOCK_EPSILON;
    return {
      solution,
      totalRequired,
      stockAvailable,
      stockShortage: 0,
      hasStockShortage: false,
      areaByUnitIndex,
      areaAdjustmentSummary: hasStockResidual
        ? 'Distribuzione estesa tra colture compatibili ma residuo non allocabile entro limiti etichetta.'
        : 'Distribuzione estesa tra colture compatibili per saturare lo stock (strategy=current).',
      stockResidual,
      hasStockResidual,
    };
  }
  const stockShortage = Math.max(0, totalRequired - stockAvailable);
  return {
    solution,
    totalRequired,
    stockAvailable,
    stockShortage,
    hasStockShortage: stockShortage > MIN_STOCK_EPSILON,
  };
}

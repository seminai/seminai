import { type BaseDoseUnit, type BaseQuantityUnit } from './unitConversion';
import { LPSolutionResult, VariableBounds } from './flowOptimizeDosageLineareFunc.part-01-variable-bounds';

/**
 * Calcola le dosi ottimali rispettando SEMPRE il range dell'etichetta.
 * @param outStockLimiter - Se true, scala le dosi per rispettare lo stock disponibile.
 *                          Se false (default), usa le dosi ottimali anche se superano lo stock.
 */
export function calculateOptimalDoses(
  variableBounds: { [key: string]: VariableBounds },
  stockAvailable: number,
  strategy: 'min' | 'max' | 'avg' | 'current',
  outStockLimiter: boolean = false,
): LPSolutionResult {
  const variables = Object.keys(variableBounds);
  let solution: { [key: string]: number } = {};

  // Calcola la dose ottimale per ogni trattamento rispettando SEMPRE il range etichetta
  for (const varName of variables) {
    const bounds = variableBounds[varName];
    let optimalDose: number;

    switch (strategy) {
      case 'min':
        optimalDose = bounds.min;
        break;
      case 'max':
        optimalDose = bounds.max;
        break;
      case 'current':
        optimalDose = bounds.target;
        break;
      case 'avg':
      default:
        optimalDose = (bounds.min + bounds.max) / 2;
        break;
    }

    // Assicurati che la dose sia nel range [min, max] dell'etichetta
    optimalDose = Math.max(bounds.min, Math.min(bounds.max, optimalDose));
    solution[varName] = Number(optimalDose.toFixed(4));
  }

  // Calcola il totale richiesto con le dosi ottimali
  const originalTotalRequired = variables.reduce(
    (sum, v) => sum + solution[v] * variableBounds[v].area,
    0,
  );

  let totalRequired = originalTotalRequired;
  let hasStockShortage = false;
  let stockShortage = 0;

  // Se lo stock è insufficiente
  if (totalRequired > stockAvailable) {
    stockShortage = totalRequired - stockAvailable;
    hasStockShortage = true;

    // Se outStockLimiter è false (default), NON scala le dosi
    // Usa le dosi ottimali e segnala solo lo shortage
    if (!outStockLimiter) {
      console.log(
        `  [LP] ⚠️ STOCK INSUFFICIENTE (outStockLimiter=false): Richiesto ${totalRequired.toFixed(2)}, Disponibile ${stockAvailable.toFixed(2)}, Mancante ${stockShortage.toFixed(2)}. Dosi NON scalate, il magazzino andrà sotto stock.`,
      );
    } else {
      // outStockLimiter = true: Scala le dosi per rispettare lo stock
      console.log(
        `  [LP] 📦 SCALING ATTIVO (outStockLimiter=true): Richiesto ${totalRequired.toFixed(2)}, Disponibile ${stockAvailable.toFixed(2)}. Procedo con scaling dosi...`,
      );

      // Calcola il minimo totale possibile (tutte le dosi al minimo)
      const minTotalRequired = variables.reduce(
        (sum, v) => sum + variableBounds[v].min * variableBounds[v].area,
        0,
      );

      // Se anche con tutte le dosi al minimo lo stock non è sufficiente
      if (minTotalRequired > stockAvailable) {
        // IMPOSSIBLE CONSTRAINT: respecting stock would require going below label minimum.
        // Business rule: DO NOT go below minimum label dose. Keep minimum doses and report shortage.
        console.log(
          `  [LP] ⚠️ STOCK CRITICO: Minimo richiesto ${minTotalRequired.toFixed(2)}, Disponibile ${stockAvailable.toFixed(2)}. ` +
            `Impossibile rispettare lo stock senza scendere sotto il minimo etichetta. Mantengo le dosi MINIME e segnalo shortage.`,
        );

        // Keep all doses at minimum
        for (const varName of variables) {
          solution[varName] = Number(variableBounds[varName].min.toFixed(4));
        }

        totalRequired = minTotalRequired;
        stockShortage = Math.max(0, totalRequired - stockAvailable);
        hasStockShortage = stockShortage > 0;
      } else {
        // Scala proporzionalmente le dosi rispettando il minimo
        // Algoritmo iterativo per scalare mantenendo i vincoli di minimo
        let remainingStock = stockAvailable;
        const scaledSolution: { [key: string]: number } = {};

        // Prima fase: assegna il minimo a tutte le variabili
        for (const varName of variables) {
          scaledSolution[varName] = variableBounds[varName].min;
          remainingStock -= variableBounds[varName].min * variableBounds[varName].area;
        }

        // Seconda fase: distribuisci lo stock rimanente proporzionalmente
        // tra le variabili che possono ancora essere aumentate
        if (remainingStock > 0) {
          // Calcola quanto "spazio" abbiamo sopra il minimo per ogni variabile
          const excessCapacity = variables.reduce((sum, v) => {
            const excess = (solution[v] - variableBounds[v].min) * variableBounds[v].area;
            return sum + Math.max(0, excess);
          }, 0);

          if (excessCapacity > 0) {
            // Distribuisci lo stock rimanente proporzionalmente
            for (const varName of variables) {
              const bounds = variableBounds[varName];
              const excess = (solution[varName] - bounds.min) * bounds.area;
              if (excess > 0) {
                const proportion = excess / excessCapacity;
                const additionalDose = (remainingStock * proportion) / bounds.area;
                scaledSolution[varName] = Math.min(bounds.max, bounds.min + additionalDose);
              }
            }
          }
        }

        // Arrotonda e assicura che tutte le dosi siano nel range valido
        for (const varName of variables) {
          const bounds = variableBounds[varName];
          scaledSolution[varName] = Number(
            Math.max(bounds.min, Math.min(bounds.max, scaledSolution[varName])).toFixed(4),
          );
        }

        solution = scaledSolution;
        totalRequired = variables.reduce((sum, v) => sum + solution[v] * variableBounds[v].area, 0);
        stockShortage = Math.max(0, totalRequired - stockAvailable);
        hasStockShortage = stockShortage > 0;

        console.log(
          `  [LP] ✅ DOSI SCALATE: Richiesto originale ${originalTotalRequired.toFixed(2)}, Scalato a ${totalRequired.toFixed(2)} per rispettare lo stock (${stockAvailable.toFixed(2)})`,
        );
      }
    }
  }

  return {
    solution,
    totalRequired,
    stockAvailable,
    stockShortage,
    hasStockShortage,
  };
}

export type DosageStrategy = 'min' | 'max' | 'avg' | 'current';

export const resolveDosageStrategy = (value: unknown): DosageStrategy | undefined => {
  if (value === 'min' || value === 'max' || value === 'avg' || value === 'current') {
    return value;
  }
  return undefined;
};

export interface TreatmentInfo {
  readonly treatmentIndex: number;
  readonly currentDose: number;
  readonly doseMin: number;
  readonly doseMax: number;
  readonly doseUnit: BaseDoseUnit;
  readonly epoca: string;
  readonly label?: { dose_minima?: number; dose_massima?: number };
}

export interface UnitInfo {
  readonly unitIndex: number;
  readonly unitId: string;
  readonly cropName: string;
  readonly areaHa: number;
  readonly maxAreaHa: number;
  readonly treatments: Array<TreatmentInfo>;
}

export interface ProductInfo {
  quantityAvailable: number;
  quantityUom: BaseQuantityUnit;
  strategy?: DosageStrategy;
  targetStock?: number;
  units: Array<UnitInfo>;
}

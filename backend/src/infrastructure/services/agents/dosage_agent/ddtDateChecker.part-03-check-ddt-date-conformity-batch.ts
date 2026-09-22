import { prisma } from '../../../repositories/Prisma';
import { DdtDateCheckResult, parseDateFlexible } from './ddtDateChecker.part-01-ddt-date-check-result';
import { calculateMinAvailableDate } from './ddtDateChecker.part-02-calculate-min-available-date';

/**
 * Batch check DDT date conformity for multiple treatments of a product
 * More efficient than checking one by one as it queries the database once
 *
 * @param treatments - Array of treatments with dates (supports various date formats)
 * @param registrationNumber - Product registration number
 * @param productName - Product name (optional, used as fallback when registrationNumber is empty)
 * @returns Array of DDT conformity check results in the same order as input
 */
export async function checkDdtDateConformityBatch(
  treatments: ReadonlyArray<{ readonly data_distribuzione?: Date | string }>,
  registrationNumber: string,
  productId?: string,
  productName?: string,
): Promise<DdtDateCheckResult[]> {
  if (treatments.length === 0) {
    return [];
  }

  try {
    const resolvedProductId = await resolveProductId({
      productId,
      registrationNumber,
      productName,
    });
    if (!resolvedProductId) {
      return treatments.map(() => ({
        ddt_date_is_ok: null,
        ddt_date_conformity:
          'Impossibile identificare il prodotto: productId/registrationNumber/productName non disponibili o non trovati',
        ddt_date_after_treatment: null,
      }));
    }

    const { minDate, hasStocksWithDate, dateSource, allStocksInfo } =
      await calculateMinAvailableDate(resolvedProductId);

    if (!hasStocksWithDate) {
      return treatments.map(() => ({
        ddt_date_is_ok: null,
        ddt_date_conformity: `Nessuna data DDT o fattura disponibile negli stock: ${allStocksInfo}. Controllo non applicabile.`,
        ddt_date_after_treatment: null,
      }));
    }

    if (!minDate) {
      return treatments.map(() => ({
        ddt_date_is_ok: null,
        ddt_date_conformity:
          'Nessuna data DDT o fattura disponibile negli stock. Controllo non applicabile.',
        ddt_date_after_treatment: null,
      }));
    }

    const sourceLabel = dateSource ?? 'DDT/Fattura';

    return treatments.map((treatment) => {
      const parsedTreatmentDate = parseDateFlexible(treatment.data_distribuzione);
      if (!parsedTreatmentDate) {
        return {
          ddt_date_is_ok: null,
          ddt_date_conformity: null,
          ddt_date_after_treatment: null,
        };
      }
      return buildConformityResult(parsedTreatmentDate, minDate, sourceLabel, allStocksInfo);
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error(`[DDT-CHECK] Error checking DDT conformity batch: ${errorMsg}`);
    return treatments.map(() => ({
      ddt_date_is_ok: null,
      ddt_date_conformity: `Errore durante il controllo: ${errorMsg}`,
      ddt_date_after_treatment: null,
    }));
  }
}

/**
 * Compares a treatment date against an availability date and returns a conformity result.
 */
export function buildConformityResult(
  treatmentDate: Date,
  availableDate: Date,
  sourceLabel: string,
  allStocksInfo: string,
): DdtDateCheckResult {
  const treatmentDateStr = treatmentDate.toISOString().split('T')[0];
  const availDateStr = availableDate.toISOString().split('T')[0];
  if (treatmentDate >= availableDate) {
    return {
      ddt_date_is_ok: true,
      ddt_date_conformity: `Conforme: trattamento (${treatmentDateStr}) è successivo o uguale alla data ${sourceLabel} disponibile (${availDateStr}). Stock: ${allStocksInfo}`,
      ddt_date_after_treatment: false,
    };
  }
  return {
    ddt_date_is_ok: false,
    ddt_date_conformity: `Non conforme: trattamento (${treatmentDateStr}) è precedente alla data ${sourceLabel} disponibile (${availDateStr}). Il prodotto può essere distribuito solo dopo la data del ${sourceLabel}. Stock: ${allStocksInfo}`,
    ddt_date_after_treatment: true,
  };
}

/**
 * Core evaluation logic shared by single and batch conformity checks.
 */
export async function evaluateDateConformity(
  resolvedProductId: string,
  treatmentDate: Date,
): Promise<DdtDateCheckResult> {
  const { minDate, hasStocksWithDate, dateSource, allStocksInfo } =
    await calculateMinAvailableDate(resolvedProductId);
  if (!hasStocksWithDate) {
    return {
      ddt_date_is_ok: null,
      ddt_date_conformity: `Nessuna data DDT o fattura disponibile negli stock: ${allStocksInfo}. Controllo non applicabile.`,
      ddt_date_after_treatment: null,
    };
  }
  if (!minDate) {
    return {
      ddt_date_is_ok: null,
      ddt_date_conformity:
        'Nessuna data DDT o fattura disponibile negli stock. Controllo non applicabile.',
      ddt_date_after_treatment: null,
    };
  }
  const sourceLabel = dateSource ?? 'DDT/Fattura';
  return buildConformityResult(treatmentDate, minDate, sourceLabel, allStocksInfo);
}

export async function resolveProductId(params: {
  readonly productId?: string;
  readonly registrationNumber: string;
  readonly productName?: string;
}): Promise<string | null> {
  // If productId is provided directly, use it
  if (params.productId && params.productId.trim().length > 0) {
    console.log(`[DDT-CHECK] Using provided productId: ${params.productId}`);
    return params.productId.trim();
  }

  const normalizedRegNumber = params.registrationNumber?.trim() || '';
  const normalizedName = params.productName?.trim() || '';

  // Strategy 1: Try by registrationNumber if available
  if (normalizedRegNumber.length > 0) {
    const productByReg = await prisma.product.findFirst({
      where: { registrationNumber: normalizedRegNumber },
      select: { id: true, name: true },
    });
    if (productByReg) {
      console.log(
        `[DDT-CHECK] Found product by registrationNumber '${normalizedRegNumber}': ${productByReg.name} (${productByReg.id})`,
      );
      return productByReg.id;
    }
    console.log(`[DDT-CHECK] No product found by registrationNumber '${normalizedRegNumber}'`);
  }

  // Strategy 2: Try by name (case-insensitive) if available
  if (normalizedName.length > 0) {
    const productByName = await prisma.product.findFirst({
      where: { name: { equals: normalizedName, mode: 'insensitive' } },
      select: { id: true, name: true, registrationNumber: true },
    });
    if (productByName) {
      console.log(
        `[DDT-CHECK] Found product by name '${normalizedName}': ${productByName.name} (${productByName.id}, regNum: ${productByName.registrationNumber ?? 'null'})`,
      );
      return productByName.id;
    }
    console.log(`[DDT-CHECK] No product found by name '${normalizedName}'`);
  }

  console.log(
    `[DDT-CHECK] Could not resolve productId for regNumber='${normalizedRegNumber}', name='${normalizedName}'`,
  );
  return null;
}

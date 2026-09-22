import { prisma } from '../../../repositories/Prisma';

/**
 * Result of DDT date conformity check for a single treatment
 */
export interface DdtDateCheckResult {
  readonly ddt_date_is_ok: boolean | null;
  readonly ddt_date_conformity: string | null;
  /** True when DDT date is after the planned treatment date (product not yet available) */
  readonly ddt_date_after_treatment: boolean | null;
}

/**
 * Parses a date string in various formats to a Date object.
 * Supports: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, MM/DD/YYYY (US)
 * @returns Date object or null if parsing fails
 */
function parseDateFlexible(dateInput: Date | string | null | undefined): Date | null {
  if (!dateInput) return null;

  // If already a Date object
  if (dateInput instanceof Date) {
    return Number.isNaN(dateInput.getTime()) ? null : dateInput;
  }

  const dateStr = String(dateInput).trim();
  if (!dateStr) return null;

  // Try ISO format first (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
  const isoDate = new Date(dateStr);
  if (!Number.isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY formats
  const europeanMatch = dateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (europeanMatch) {
    const day = parseInt(europeanMatch[1], 10);
    const month = parseInt(europeanMatch[2], 10);
    const year = parseInt(europeanMatch[3], 10);

    // Validate ranges
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const parsed = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  // Try YYYY/MM/DD format
  const slashIsoMatch = dateStr.match(/^(\d{4})[/](\d{1,2})[/](\d{1,2})$/);
  if (slashIsoMatch) {
    const year = parseInt(slashIsoMatch[1], 10);
    const month = parseInt(slashIsoMatch[2], 10);
    const day = parseInt(slashIsoMatch[3], 10);

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const parsed = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  console.warn(`[DDT-CHECK] Unable to parse date: "${dateStr}"`);
  return null;
}

/**
 * Stock entry with DDT and invoice date information
 */
interface StockWithDdt {
  readonly quantity: number;
  readonly ddtDate: Date | null;
  readonly ddtCode: string | null;
  readonly invoiceDate: Date | null;
}

/**
 * Get all stock movements for a product with DDT/invoice dates, ordered by effective date
 */
async function getProductStocksWithDdt(productId: string): Promise<StockWithDdt[]> {
  const stocks = await prisma.stock.findMany({
    where: {
      productId,
      type: 'IN',
    },
    select: {
      quantity: true,
      ddtDate: true,
      ddtCode: true,
      invoiceDate: true,
    },
    orderBy: {
      ddtDate: 'asc',
    },
  });

  return stocks;
}

/**
 * Get total consumed quantity for a product (sum of OUT movements)
 */
async function getTotalConsumedQuantity(productId: string): Promise<number> {
  const result = await prisma.stock.aggregate({
    where: {
      productId,
      type: 'OUT',
    },
    _sum: {
      quantity: true,
    },
  });

  return Math.abs(result._sum.quantity ?? 0);
}

/**
 * Returns the effective availability date for a stock entry.
 * Priority: ddtDate first, then invoiceDate as fallback.
 */
function getEffectiveDate(stock: StockWithDdt): Date | null {
  return stock.ddtDate ?? stock.invoiceDate ?? null;
}

/**
 * Returns a human-readable label for the date source used on a stock entry.
 */
function getDateSourceLabel(stock: StockWithDdt): string {
  if (stock.ddtDate) return 'DDT';
  if (stock.invoiceDate) return 'Fattura';
  return 'N/A';
}

/**
 * Calculate the minimum availability date (DDT or invoice) from which stock is available
 * considering already consumed quantities (FIFO logic).
 *
 * Priority: ddtDate > invoiceDate. Non-blocking when no dates are present.
 */
async function calculateMinAvailableDate(
  productId: string,
): Promise<{
  minDate: Date | null;
  hasStocksWithDate: boolean;
  dateSource: string | null;
  allStocksInfo: string;
}> {
  const stocks = await getProductStocksWithDdt(productId);
  const totalConsumed = await getTotalConsumedQuantity(productId);
  const stocksWithDate = stocks.filter((s) => getEffectiveDate(s) !== null);

  if (stocks.length === 0) {
    return {
      minDate: null,
      hasStocksWithDate: false,
      dateSource: null,
      allStocksInfo: 'Nessuno stock presente per questo prodotto',
    };
  }

  if (stocksWithDate.length === 0) {
    return {
      minDate: null,
      hasStocksWithDate: false,
      dateSource: null,
      allStocksInfo: 'Gli stock presenti non hanno date DDT o fattura associate',
    };
  }

  // Sort by effective date for FIFO logic
  const sortedStocks = [...stocks].sort((a, b) => {
    const dateA = getEffectiveDate(a);
    const dateB = getEffectiveDate(b);
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateA.getTime() - dateB.getTime();
  });

  let cumulativeStock = 0;
  let minAvailableDate: Date | null = null;
  let resolvedSource: string | null = null;

  for (const stock of sortedStocks) {
    cumulativeStock += stock.quantity;
    if (cumulativeStock > totalConsumed) {
      const effective = getEffectiveDate(stock);
      if (effective) {
        minAvailableDate = effective;
        resolvedSource = getDateSourceLabel(stock);
        break;
      }
    }
  }

  // If all stock is consumed but we have stocks with dates, use the most recent one
  if (!minAvailableDate && stocksWithDate.length > 0) {
    const lastWithDate = stocksWithDate[stocksWithDate.length - 1];
    minAvailableDate = getEffectiveDate(lastWithDate);
    resolvedSource = getDateSourceLabel(lastWithDate);
  }

  const stocksInfo = stocksWithDate
    .map((s) => {
      const effective = getEffectiveDate(s);
      const source = getDateSourceLabel(s);
      const dateStr = effective?.toISOString().split('T')[0] || 'N/A';
      const code = s.ddtCode ? ` ${s.ddtCode}` : '';
      return `${source}${code}: ${dateStr} (${s.quantity} unità)`;
    })
    .join('; ');

  return {
    minDate: minAvailableDate,
    hasStocksWithDate: true,
    dateSource: resolvedSource,
    allStocksInfo: stocksInfo,
  };
}

/**
 * Check DDT date conformity for a single treatment
 *
 * @param treatmentDate - The date of the planned treatment (supports various formats)
 * @param registrationNumber - Product registration number to look up stock
 * @param productName - Product name (optional, used as fallback when registrationNumber is empty)
 * @returns DDT conformity check result
 */
export async function checkDdtDateConformity(
  treatmentDate: Date | string | undefined,
  registrationNumber: string,
  productId?: string,
  productName?: string,
): Promise<DdtDateCheckResult> {
  const parsedTreatmentDate = parseDateFlexible(treatmentDate);

  if (!parsedTreatmentDate) {
    return {
      ddt_date_is_ok: null,
      ddt_date_conformity: null,
      ddt_date_after_treatment: null,
    };
  }

  try {
    const resolvedProductId = await resolveProductId({
      productId,
      registrationNumber,
      productName,
    });
    if (!resolvedProductId) {
      return {
        ddt_date_is_ok: null,
        ddt_date_conformity:
          'Impossibile identificare il prodotto: productId/registrationNumber/productName non disponibili o non trovati',
        ddt_date_after_treatment: null,
      };
    }

    return evaluateDateConformity(resolvedProductId, parsedTreatmentDate);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error(`[DDT-CHECK] Error checking DDT conformity: ${errorMsg}`);
    return {
      ddt_date_is_ok: null,
      ddt_date_conformity: `Errore durante il controllo: ${errorMsg}`,
      ddt_date_after_treatment: null,
    };
  }
}

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
function buildConformityResult(
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
async function evaluateDateConformity(
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

async function resolveProductId(params: {
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

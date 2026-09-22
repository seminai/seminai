import { DdtDateCheckResult, getDateSourceLabel, getEffectiveDate, getProductStocksWithDdt, getTotalConsumedQuantity, parseDateFlexible } from './ddtDateChecker.part-01-ddt-date-check-result';
import { evaluateDateConformity, resolveProductId } from './ddtDateChecker.part-03-check-ddt-date-conformity-batch';

/**
 * Calculate the minimum availability date (DDT or invoice) from which stock is available
 * considering already consumed quantities (FIFO logic).
 *
 * Priority: ddtDate > invoiceDate. Non-blocking when no dates are present.
 */
export async function calculateMinAvailableDate(
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

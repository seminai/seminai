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
export function parseDateFlexible(dateInput: Date | string | null | undefined): Date | null {
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
export interface StockWithDdt {
  readonly quantity: number;
  readonly ddtDate: Date | null;
  readonly ddtCode: string | null;
  readonly invoiceDate: Date | null;
}

/**
 * Get all stock movements for a product with DDT/invoice dates, ordered by effective date
 */
export async function getProductStocksWithDdt(productId: string): Promise<StockWithDdt[]> {
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
export async function getTotalConsumedQuantity(productId: string): Promise<number> {
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
export function getEffectiveDate(stock: StockWithDdt): Date | null {
  return stock.ddtDate ?? stock.invoiceDate ?? null;
}

/**
 * Returns a human-readable label for the date source used on a stock entry.
 */
export function getDateSourceLabel(stock: StockWithDdt): string {
  if (stock.ddtDate) return 'DDT';
  if (stock.invoiceDate) return 'Fattura';
  return 'N/A';
}

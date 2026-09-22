import { Prisma } from '@prisma/client';
import { prisma } from '../../../../../repositories/Prisma';
import { cleanRegNumber } from '../../../dosage_agent/cleanRegNumber';

/**
 * Verified stocks: only count stocks not linked to a job, or linked to a verified job.
 * Mirrors the rule used by `search_company_stock_products`.
 */
const VERIFIED_STOCK_WHERE: Prisma.StockWhereInput = {
  OR: [{ jobId: null }, { job: { isVerified: true } }],
};

export interface VerifiedStockEntry {
  readonly name: string;
  readonly netQuantity: number;
  readonly unit: string;
}

/** Strips a registration number to its canonical, zero-trimmed form for matching. */
export function normalizeRegistrationNumber(reg: string): string {
  return (cleanRegNumber(reg) || reg).replace(/^0+/, '');
}

/**
 * Loads verified net stock for the user's companies, keyed by NORMALIZED
 * registration number so it can be matched against BDF `NUM_REG`. Products
 * without a registration number or with non-positive net stock are skipped.
 */
export async function loadVerifiedStockByRegistration(
  userId: string,
): Promise<Map<string, VerifiedStockEntry>> {
  const map = new Map<string, VerifiedStockEntry>();

  const userCompanies = await prisma.userOnCompany.findMany({
    where: { userId },
    select: { companyId: true },
  });
  const companyIds = userCompanies.map((uc) => uc.companyId);
  if (companyIds.length === 0) return map;

  const products = await prisma.product.findMany({
    where: { warehouse: { companyId: { in: companyIds } } },
    include: {
      stocks: {
        where: VERIFIED_STOCK_WHERE,
        select: { quantity: true, unitOfMeasureQuantity: true, type: true },
      },
    },
  });

  for (const product of products) {
    if (!product.registrationNumber) continue;
    const netQuantity = product.stocks.reduce((total, stock) => {
      if (stock.type === 'IN' || stock.type === 'CARICO') return total + Math.abs(stock.quantity);
      if (stock.type === 'OUT' || stock.type === 'SCARICO') return total - Math.abs(stock.quantity);
      return total;
    }, 0);
    if (netQuantity <= 0) continue;

    const unit = product.stocks.find((s) => s.unitOfMeasureQuantity)?.unitOfMeasureQuantity ?? '';
    const key = normalizeRegistrationNumber(product.registrationNumber);
    const existing = map.get(key);
    map.set(key, {
      name: product.name,
      netQuantity:
        Math.round((existing ? existing.netQuantity + netQuantity : netQuantity) * 100) / 100,
      unit,
    });
  }
  return map;
}

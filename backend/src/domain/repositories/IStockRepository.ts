import { Stock } from '../entities/Stock';
import { UpdateStockProps } from '../dtos/stock.dto';

export interface IStockRepository {
  create(stock: Stock): Promise<Stock>;
  createMany(stocks: Stock[]): Promise<void>;
  /**
   * Available physical balance for a product within a company
   * (IN movements positive + OUT movements negative; OUT from unverified jobs ignored).
   */
  getAvailableQuantity(productId: string, companyId: string): Promise<number>;
  deleteByJobId(jobId: string): Promise<void>;
  /** Deletes stocks whose `sourceFileId` is in the given list. Used when source PDFs are removed. */
  deleteBySourceFileIds(ids: readonly string[]): Promise<number>;
  /** Deletes every stock that belongs to products of the given company. Used by the "Magazzino" cascade. */
  deleteByCompanyId(companyId: string): Promise<number>;
  updateFileUrl(
    stockId: string,
    update: { ddtUrlFile?: string | null; invoiceUrlFile?: string | null },
  ): Promise<Stock>;
  update(stockId: string, update: UpdateStockProps): Promise<Stock>;
  /** Returns `null` when the stock does not exist. `isJobVerified` is `null` when the stock has no associated job. */
  findDeletionContext(
    stockId: string,
  ): Promise<{ jobId: string | null; isJobVerified: boolean | null } | null>;
  delete(stockId: string): Promise<void>;
}

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { IProductRepository } from '../../../domain/repositories/IProductRepository';
import { IStockRepository } from '../../../domain/repositories/IStockRepository';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { SyncProductLabelsRequest } from '../../../domain/dtos/product.dto';
import type { ProductControllerContext } from './product-controller.context';
import { productControllerCreate } from './product-controller.01-create';
import { productControllerFindById } from './product-controller.02-find-by-id';
import { productControllerListByWarehouse } from './product-controller.03-list-by-warehouse';
import { productControllerListByUser } from './product-controller.04-list-by-user';
import { productControllerUpdate } from './product-controller.05-update';
import { productControllerDelete } from './product-controller.06-delete';
import { productControllerCreateBulk } from './product-controller.07-create-bulk';
import { productControllerCreateOrUpdateBulk } from './product-controller.08-create-or-update-bulk';
import { productControllerDeleteBulk } from './product-controller.09-delete-bulk';
import { productControllerBulkFromDdtToProductList } from './product-controller.10-bulk-from-ddt-to-product-list';
import { productControllerBulkFromInvoiceToProductList } from './product-controller.11-bulk-from-invoice-to-product-list';
import { productControllerImportFromCsvExcel } from './product-controller.12-import-from-csv-excel';
import { productControllerUpdateAdministrativeStatus } from './product-controller.13-update-administrative-status';
import { productControllerDownloadTemplate } from './product-controller.14-download-template';
import { productControllerListVerifiedPhytosanitaryProducts } from './product-controller.15-list-verified-phytosanitary-products';
import { productControllerAlignProducts } from './product-controller.16-align-products';
import { productControllerSyncLabels } from './product-controller.17-sync-labels';
import { productControllerFindSyncCandidates } from './product-controller.18-find-sync-candidates';


export class ProductController {

  constructor(
    readonly productRepository: IProductRepository,
    readonly stockRepository?: IStockRepository,
    readonly warehouseRepository?: IWarehouseRepository,
    readonly prisma?: PrismaClient,
  ) {}

  async create(request: Request, response: Response): Promise<Response> {
    return productControllerCreate.call(this as unknown as ProductControllerContext, request, response);
  }

  async findById(request: Request, response: Response): Promise<Response> {
    return productControllerFindById.call(this as unknown as ProductControllerContext, request, response);
  }

  async listByWarehouse(request: Request, response: Response): Promise<Response> {
    return productControllerListByWarehouse.call(this as unknown as ProductControllerContext, request, response);
  }

  async listByUser(request: Request, response: Response): Promise<Response> {
    return productControllerListByUser.call(this as unknown as ProductControllerContext, request, response);
  }

  async update(request: Request, response: Response): Promise<Response> {
    return productControllerUpdate.call(this as unknown as ProductControllerContext, request, response);
  }

  async delete(request: Request, response: Response): Promise<Response> {
    return productControllerDelete.call(this as unknown as ProductControllerContext, request, response);
  }

  async createBulk(request: Request, response: Response): Promise<Response> {
    return productControllerCreateBulk.call(this as unknown as ProductControllerContext, request, response);
  }

  async createOrUpdateBulk(request: Request, response: Response): Promise<Response> {
    return productControllerCreateOrUpdateBulk.call(this as unknown as ProductControllerContext, request, response);
  }

  async deleteBulk(request: Request, response: Response): Promise<Response> {
    return productControllerDeleteBulk.call(this as unknown as ProductControllerContext, request, response);
  }

  async bulkFromDdtToProductList(request: Request, response: Response): Promise<Response> {
    return productControllerBulkFromDdtToProductList.call(this as unknown as ProductControllerContext, request, response);
  }

  /**
   * Extracts product data from one or more invoice files (PDF or XML FatturaPA).
   */
  async bulkFromInvoiceToProductList(request: Request, response: Response): Promise<Response> {
    return productControllerBulkFromInvoiceToProductList.call(this as unknown as ProductControllerContext, request, response);
  }

  async importFromCsvExcel(request: Request, response: Response): Promise<Response> {
    return productControllerImportFromCsvExcel.call(this as unknown as ProductControllerContext, request, response);
  }

  async updateAdministrativeStatus(request: Request, response: Response): Promise<Response> {
    return productControllerUpdateAdministrativeStatus.call(this as unknown as ProductControllerContext, request, response);
  }

  async downloadTemplate(_request: Request, response: Response): Promise<Response> {
    return productControllerDownloadTemplate.call(this as unknown as ProductControllerContext, _request, response);
  }

  async listVerifiedPhytosanitaryProducts(request: Request, response: Response): Promise<Response> {
    return productControllerListVerifiedPhytosanitaryProducts.call(this as unknown as ProductControllerContext, request, response);
  }

  /**
   * Aligns (deduplicates) existing products by merging variants of the same base product.
   * Moves stocks from duplicates to the winner product and deletes duplicates.
   */
  async alignProducts(request: Request, response: Response): Promise<Response> {
    return productControllerAlignProducts.call(this as unknown as ProductControllerContext, request, response);
  }

  async syncLabels(request: Request, response: Response): Promise<Response> {
    return productControllerSyncLabels.call(this as unknown as ProductControllerContext, request, response);
  }

  async findSyncCandidates(
    userId: string,
    filter: SyncProductLabelsRequest,
  ): Promise<Array<{ id: string; labelMetadata: unknown }>> {
    return productControllerFindSyncCandidates.call(this as unknown as ProductControllerContext, userId, filter);
  }
}

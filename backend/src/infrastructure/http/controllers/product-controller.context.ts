import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { IProductRepository } from '../../../domain/repositories/IProductRepository';
import { IStockRepository } from '../../../domain/repositories/IStockRepository';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { SyncProductLabelsRequest } from '../../../domain/dtos/product.dto';

export interface ProductControllerContext {
  readonly productRepository: IProductRepository;
  readonly stockRepository: IStockRepository;
  readonly warehouseRepository: IWarehouseRepository;
  readonly prisma: PrismaClient;
  create(request: Request, response: Response): Promise<Response>;
  findById(request: Request, response: Response): Promise<Response>;
  listByWarehouse(request: Request, response: Response): Promise<Response>;
  listByUser(request: Request, response: Response): Promise<Response>;
  update(request: Request, response: Response): Promise<Response>;
  delete(request: Request, response: Response): Promise<Response>;
  createBulk(request: Request, response: Response): Promise<Response>;
  createOrUpdateBulk(request: Request, response: Response): Promise<Response>;
  deleteBulk(request: Request, response: Response): Promise<Response>;
  bulkFromDdtToProductList(request: Request, response: Response): Promise<Response>;
  bulkFromInvoiceToProductList(request: Request, response: Response): Promise<Response>;
  importFromCsvExcel(request: Request, response: Response): Promise<Response>;
  updateAdministrativeStatus(request: Request, response: Response): Promise<Response>;
  downloadTemplate(_request: Request, response: Response): Promise<Response>;
  listVerifiedPhytosanitaryProducts(request: Request, response: Response): Promise<Response>;
  alignProducts(request: Request, response: Response): Promise<Response>;
  syncLabels(request: Request, response: Response): Promise<Response>;
  findSyncCandidates(userId: string, filter: SyncProductLabelsRequest): Promise<Array<{ id: string; labelMetadata: unknown }>>;
}

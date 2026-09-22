import { Request, Response } from 'express';
import { PrismaClient, ProductCategory } from '@prisma/client';
import { IProductRepository } from '../../../domain/repositories/IProductRepository';
import { AppError } from '../../../domain/errors/AppError';
import { Product } from '../../../domain/entities/Product';
import { IStockRepository } from '../../../domain/repositories/IStockRepository';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import {
  CreateProductUseCase,
  CreateProductDTO,
} from '../../../application/use-cases/product/CreateProductUseCase';
import { CreateProductsBulkUseCase } from '../../../application/use-cases/product/CreateProductsBulkUseCase';
import {
  CreateOrUpdateProductsAndStocksBulkUseCase,
  ProductWithStockInput,
} from '../../../application/use-cases/product/CreateOrUpdateProductsAndStocksBulkUseCase';
import { DeleteProductsBulkUseCase } from '../../../application/use-cases/product/DeleteProductsBulkUseCase';
import { ImportProductsFromCsvExcelUseCase } from '../../../application/use-cases/product/ImportProductsFromCsvExcelUseCase';
import { ExtractDataFromDdtService } from '../../services/tool/extractDataFromDDT';
import { DdtEntry } from '../../../domain/dtos/ddt-entry.dto';
import { ExtractDataFromInvoiceService } from '../../services/tool/extractDataFromInvoice';
import { InvoiceEntry } from '../../../domain/dtos/invoice-entry.dto';
import { productRegistrationLookupServiceSingleton } from '../../services/utils/ProductRegistrationLookupServiceSingleton';
import { FitosanitariLookupService } from '../../services/utils/FitosanitariLookupService';
import { ListVerifiedPhytosanitaryProductsUseCase } from '../../../application/use-cases/product/ListVerifiedPhytosanitaryProductsUseCase';
import { AlignProductsUseCase } from '../../../application/use-cases/product/AlignProductsUseCase';
import { mapToProductCategory } from '../../../application/use-cases/product/product-category.mapper';
import { toTitleCase } from '../../../utils/string.util';
import { GroupInvoiceSuggestedProductsWithStocksService } from '../../services/tool/group-invoice-suggested-products-with-stocks';
import { LlmProductCategoryClassifier } from '../../services/tool/llm-product-category-classifier';
import {
  parseProductName,
  resolveOfficialName,
  isPiecesUnit,
  convertPiecesToRealUnit,
} from '../../services/utils/ProductNameParser';
import { convertQuantityToCanonicalUnit } from '../../utils/quantityConversion';
import { getProductLabelMatchingQueue } from '../../queue/ProductLabelMatchingQueue';
import { triggerLabelSyncIfStale } from '../../services/product/triggerLabelSyncIfStale';
import { isStaleSummary } from '../../../application/use-cases/product/buildProductLabelSummary';
import {
  SyncProductLabelsRequest,
  SyncProductLabelsResponse,
} from '../../../domain/dtos/product.dto';
import { resolveOcrProvider } from '../../services/ocr/ocr-provider';
import fs from 'fs';
import path from 'path';
import os from 'os';

type ExtractedProductCategory = 'PHYTOSANITARY' | 'FERTILIZER' | 'OTHER';

type EnrichableProduct = {
  labelMetadata?: unknown;
  category?: ProductCategory | string | null;
  registrationNumber?: string | null;
  name?: string | null;
  administrativeStatus?: string | null;
};

function withPrincipioAttivo<T extends EnrichableProduct>(product: T) {
  const meta = product.labelMetadata as { principio_attivo?: string } | null | undefined;
  const isPesticide = product.category === ProductCategory.PESTICIDE;
  const fitosanitari = isPesticide ? FitosanitariLookupService.getInstance() : null;
  const principioAttivoFromLabel = meta?.principio_attivo ?? null;
  const principioAttivoFromDataset =
    principioAttivoFromLabel || !fitosanitari
      ? null
      : fitosanitari.lookupActiveIngredients(
          product.registrationNumber ?? null,
          product.name ?? null,
        );
  const freshStatus = fitosanitari
    ? fitosanitari.lookupStatus(product.registrationNumber ?? null, product.name ?? null)
    : null;
  return {
    ...product,
    principioAttivo: principioAttivoFromLabel ?? principioAttivoFromDataset,
    administrativeStatus: freshStatus ?? product.administrativeStatus ?? null,
  };
}

function normalizeProductNameKey(productName: string): string {
  return productName.trim().toUpperCase();
}

function toExtractedProductCategory(value: string): ExtractedProductCategory {
  return value === 'PHYTOSANITARY' || value === 'FERTILIZER' ? value : 'OTHER';
}

function resolveExtractedCategory(params: {
  entryCategory: string;
  registrationNumber: string | null;
  productName: string;
  llmCategoryByName: ReadonlyMap<string, ExtractedProductCategory>;
}): ExtractedProductCategory {
  if (params.registrationNumber && params.registrationNumber.trim().length > 0) {
    return 'PHYTOSANITARY';
  }
  const category = toExtractedProductCategory(params.entryCategory);
  if (category !== 'OTHER') {
    return category;
  }
  return params.llmCategoryByName.get(normalizeProductNameKey(params.productName)) ?? 'OTHER';
}

export class ProductController {
  constructor(
    private readonly productRepository: IProductRepository,
    private readonly stockRepository?: IStockRepository,
    private readonly warehouseRepository?: IWarehouseRepository,
    private readonly prisma?: PrismaClient,
  ) {}

  async create(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const body = request.body as CreateProductDTO;

    const useCase = new CreateProductUseCase(this.productRepository, this.stockRepository!);
    const { product } = await useCase.execute({
      warehouseId: body.warehouseId,
      name: body.name ? toTitleCase(body.name) : body.name,
      sku: body.sku,
      barcode: body.barcode ?? null,
      category: body.category,
      type: body.type,
      description: body.description ?? null,
      registrationNumber: body.registrationNumber ?? null,
      labelUrl: body.labelUrl ?? null,
      labelMetadata: body.labelMetadata ?? null,
      vintage: body.vintage ?? null,
      unitPrice: body.unitPrice ?? null,
      vatRate: body.vatRate ?? null,
      unitOfMeasure: body.unitOfMeasure ?? null,
      isActive: body.isActive ?? true,
      stock: body.stock ?? null,
    });

    return response.status(201).json({ status: 'success', data: { product } });
  }

  async findById(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;
    const product = await this.productRepository.findById(id);
    if (!product) {
      throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    }
    return response.json({ status: 'success', data: { product: withPrincipioAttivo(product) } });
  }

  async listByWarehouse(request: Request, response: Response): Promise<Response> {
    const { warehouseId } = request.params;
    const list = await this.productRepository.findManyByWarehouseId(warehouseId);
    if (request.user?.id) {
      triggerLabelSyncIfStale(request.user.id, list);
    }
    return response.json({ status: 'success', data: { products: list.map(withPrincipioAttivo) } });
  }

  async listByUser(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const companyName = request.query?.companyName as string | undefined;
    const products = await this.productRepository.findManyByUserId(request.user.id, companyName);
    triggerLabelSyncIfStale(request.user.id, products);
    return response.json({
      status: 'success',
      data: { products: products.map(withPrincipioAttivo) },
    });
  }

  async update(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;
    const updateData = request.body as Partial<Product>;

    const existing = await this.productRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    }

    const finalName =
      typeof updateData.name !== 'undefined' ? toTitleCase(updateData.name) : existing.name;
    const finalRegistrationNumber =
      typeof updateData.registrationNumber !== 'undefined'
        ? updateData.registrationNumber?.trim() ?? null
        : existing.registrationNumber?.trim() ?? null;
    const finalCategory = mapToProductCategory(
      typeof updateData.category !== 'undefined' ? updateData.category : existing.category,
      finalRegistrationNumber,
    );
    const fitosanitariService = FitosanitariLookupService.getInstance();
    const administrativeStatus =
      finalCategory === ProductCategory.PESTICIDE
        ? fitosanitariService.lookupStatus(finalRegistrationNumber, finalName)
        : null;
    const normalizedUpdateData: Partial<Product> = {
      ...updateData,
      name: finalName,
      category: finalCategory,
      registrationNumber: finalRegistrationNumber,
      administrativeStatus,
    };
    const updated = await this.productRepository.update(id, normalizedUpdateData);
    return response.json({ status: 'success', data: { product: updated } });
  }

  async delete(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;
    const existing = await this.productRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    }
    await this.productRepository.delete(id);
    return response.status(204).send();
  }

  async createBulk(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { warehouseId, products } = request.body as {
      warehouseId: string;
      products: Array<Omit<CreateProductDTO, 'warehouseId'>>;
    };

    if (!warehouseId || !Array.isArray(products) || products.length === 0) {
      throw AppError.badRequest('Missing required fields', 'MISSING_FIELDS');
    }

    const useCase = new CreateProductsBulkUseCase(this.productRepository, this.stockRepository!);
    const { products: created, stockErrors } = await useCase.execute({ warehouseId, products });
    return response.status(201).json({
      status: 'success',
      data: { products: created, stockErrors },
    });
  }

  async createOrUpdateBulk(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { companyId, warehouseId, products } = request.body as {
      companyId: string;
      warehouseId?: string;
      products: ProductWithStockInput[];
    };

    if (!companyId || !Array.isArray(products) || products.length === 0) {
      throw AppError.badRequest('Missing required fields', 'MISSING_FIELDS');
    }

    if (!this.stockRepository || !this.warehouseRepository) {
      throw AppError.internal('Required dependencies not initialized', 'MISSING_DEPENDENCIES');
    }

    const useCase = new CreateOrUpdateProductsAndStocksBulkUseCase(
      this.productRepository,
      this.stockRepository,
      this.warehouseRepository,
    );

    const result = await useCase.execute({ companyId, warehouseId, products });

    if (result.productIds.length > 0) {
      try {
        const labelQueue = getProductLabelMatchingQueue();
        await labelQueue.addJob({ productIds: result.productIds });
      } catch (queueError) {
        console.error('[PRODUCT-CONTROLLER] Failed to queue label matching job:', queueError);
      }
    }

    return response.status(200).json({
      status: 'success',
      data: {
        productsCreated: result.productsCreated,
        productsUpdated: result.productsUpdated,
        stocksCreated: result.stocksCreated,
        errors: result.errors,
      },
    });
  }

  async deleteBulk(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { companyId, ids } = request.body as {
      companyId: string;
      ids: string[];
    };

    if (!companyId || !Array.isArray(ids) || ids.length === 0) {
      throw AppError.badRequest('Missing required fields', 'MISSING_FIELDS');
    }

    const useCase = new DeleteProductsBulkUseCase(this.productRepository);
    await useCase.execute({ companyId, ids });
    return response.status(204).send();
  }

  async bulkFromDdtToProductList(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const files = request.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      throw AppError.badRequest('No files provided', 'NO_FILES');
    }

    const MAX_FILES = 10;
    if (files.length > MAX_FILES) {
      throw AppError.badRequest(
        `Too many files. Maximum ${MAX_FILES} files allowed per request`,
        'TOO_MANY_FILES',
      );
    }

    const tempFiles: string[] = [];
    const allEntries: DdtEntry[] = [];
    const DDT_CONCURRENCY = 3;
    const ocrProvider = resolveOcrProvider(request.body?.ocrProvider);

    try {
      const service = new ExtractDataFromDdtService();

      // Write all temp files upfront before parallel processing
      const fileInfos = files.map((file) => {
        const tempFilePath = path.join(os.tmpdir(), `ddt_${Date.now()}_${file.originalname}`);
        fs.writeFileSync(tempFilePath, file.buffer as unknown as Uint8Array);
        tempFiles.push(tempFilePath);
        return { file, tempFilePath };
      });

      // Process in batches with controlled concurrency
      for (let i = 0; i < fileInfos.length; i += DDT_CONCURRENCY) {
        const batch = fileInfos.slice(i, i + DDT_CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map(async ({ file, tempFilePath }) => {
            console.log(`[DDT_BULK] Processing file: ${file.originalname} (${file.size} bytes)`);
            const result = await service.execute({ pdfPath: tempFilePath, ocrProvider });
            console.log(
              `[DDT_BULK] Extracted ${result.entries.length} entries from ${file.originalname}`,
            );
            if (result.rawTextPath && fs.existsSync(result.rawTextPath)) {
              fs.rmSync(result.rawTextPath);
            }
            return result.entries;
          }),
        );
        for (const settled of batchResults) {
          if (settled.status === 'fulfilled') {
            allEntries.push(...settled.value);
          } else {
            console.error(`[DDT_BULK] File extraction failed:`, settled.reason);
          }
        }
      }

      console.log(`[DDT_BULK] Total entries collected: ${allEntries.length}`);
      if (allEntries.length === 0) {
        console.warn(
          `[DDT_BULK] No entries extracted from ${files.length} file(s). This might indicate an issue with the PDF format or extraction process.`,
        );
      }
      const llmCategoryClassifier = new LlmProductCategoryClassifier();
      const ddtOtherNames = allEntries
        .filter((entry) => entry.productCategory === 'OTHER' && !entry.registrationNumber)
        .map((entry) => entry.productName);
      const ddtLlmCategoryByName = await llmCategoryClassifier.classifyProductNames({
        productNames: ddtOtherNames,
      });

      const suggestedProducts = allEntries.map((entry) => {
        const parsed = parseProductName(entry.productName);
        const normalizedName = resolveOfficialName(parsed.baseName);
        const resolvedCategory = resolveExtractedCategory({
          entryCategory: entry.productCategory,
          registrationNumber: entry.registrationNumber,
          productName: entry.productName,
          llmCategoryByName: ddtLlmCategoryByName,
        });

        let effectiveQuantity = entry.quantity;
        let effectiveUnit = entry.quantityUnitOfMeasure;

        if (effectiveQuantity !== null && effectiveUnit && isPiecesUnit(effectiveUnit)) {
          const piecesConversion = convertPiecesToRealUnit(
            effectiveQuantity,
            effectiveUnit,
            entry.productName,
          );
          if (piecesConversion.converted) {
            effectiveQuantity = piecesConversion.quantity;
            effectiveUnit = piecesConversion.unitOfMeasure;
          }
        }

        const conversion = convertQuantityToCanonicalUnit(effectiveQuantity, effectiveUnit);
        const product = {
          productName: normalizedName,
          productNameExtracted: entry.productName.trim(),
          registrationNumber: entry.registrationNumber,
          administrativeStatus: null as string | null,
          productCategory: resolvedCategory,
          quantity: entry.quantity,
          quantityUnitOfMeasure: entry.quantityUnitOfMeasure,
          quantityConverted: conversion?.quantityConverted ?? entry.quantity,
          unitMeasureConverted: conversion?.unitMeasureConverted ?? entry.quantityUnitOfMeasure,
          quantityExtractedInProductName: parsed.packagingQuantity,
          quantityExtractedInProductNameUnit: parsed.packagingUnit,
          supplierName: entry.supplierName,
          supplierVat: entry.supplierVat,
          ddtDate: entry.ddtDate,
          orderNumber: entry.orderNumber,
        };
        console.log(`[DDT_BULK] Mapped entry: ${JSON.stringify(product)}`);
        return product;
      });

      console.log(`[DDT_BULK] Mapped ${suggestedProducts.length} products before enrichment`);
      const enrichedProducts =
        productRegistrationLookupServiceSingleton.enrichProductsWithRegistration(suggestedProducts);
      console.log(`[DDT_BULK] After enrichment: ${enrichedProducts.length} products`);

      const responseData = {
        status: 'success' as const,
        data: { suggestedProducts: enrichedProducts, totalEntries: allEntries.length },
      };
      console.log(
        `[DDT_BULK] Returning response with ${enrichedProducts.length} products and ${allEntries.length} total entries`,
      );
      console.log(
        `[DDT_BULK] Response data preview: ${JSON.stringify(responseData).substring(0, 500)}`,
      );
      const jsonResponse = response.status(200).json(responseData);
      console.log(`[DDT_BULK] Response sent successfully`);
      return jsonResponse;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error during DDT extraction';
      console.error(`[DDT_BULK] Extraction error: ${message}`, error);
      throw AppError.internal(message, 'DDT_EXTRACTION_ERROR');
    } finally {
      for (const tempFile of tempFiles) {
        if (fs.existsSync(tempFile)) {
          fs.rmSync(tempFile);
        }
      }
    }
  }

  /**
   * Extracts product data from one or more invoice files (PDF or XML FatturaPA).
   */
  async bulkFromInvoiceToProductList(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const files = request.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      throw AppError.badRequest('No files provided', 'NO_FILES');
    }
    const MAX_FILES = 10;
    if (files.length > MAX_FILES) {
      throw AppError.badRequest(
        `Too many files. Maximum ${MAX_FILES} files allowed per request`,
        'TOO_MANY_FILES',
      );
    }
    const tempFiles: string[] = [];
    const allEntries: InvoiceEntry[] = [];
    const fileErrors: Array<{ fileName: string; error: string }> = [];
    const INVOICE_CONCURRENCY = 3;
    const ocrProvider = resolveOcrProvider(request.body?.ocrProvider);
    const service = new ExtractDataFromInvoiceService();
    try {
      // Write all temp files upfront before parallel processing
      const fileInfos = files.map((file) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const tempFilePath = path.join(os.tmpdir(), `invoice_${Date.now()}_${file.originalname}`);
        fs.writeFileSync(tempFilePath, file.buffer as unknown as Uint8Array);
        tempFiles.push(tempFilePath);
        return { file, tempFilePath, extension };
      });

      // Process in batches with controlled concurrency
      for (let i = 0; i < fileInfos.length; i += INVOICE_CONCURRENCY) {
        const batch = fileInfos.slice(i, i + INVOICE_CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map(async ({ file, tempFilePath, extension }) => {
            console.log(
              `[INVOICE_BULK] Processing file: ${file.originalname} (${file.size} bytes, format: ${extension})`,
            );
            const result = await service.execute({ filePath: tempFilePath, ocrProvider });
            console.log(
              `[INVOICE_BULK] Extracted ${result.entries.length} entries from ${file.originalname}`,
            );
            if (
              result.rawTextPath &&
              result.rawTextPath !== tempFilePath &&
              fs.existsSync(result.rawTextPath)
            ) {
              fs.rmSync(result.rawTextPath);
            }
            return { entries: result.entries, fileName: file.originalname };
          }),
        );
        for (const settled of batchResults) {
          if (settled.status === 'fulfilled') {
            allEntries.push(...settled.value.entries);
          } else {
            const errorMessage =
              settled.reason instanceof Error ? settled.reason.message : 'Unknown error';
            const fileName = (settled.reason as { fileName?: string })?.fileName ?? 'unknown';
            console.warn(`[INVOICE_BULK] Skipping file ${fileName}: ${errorMessage}`);
            fileErrors.push({ fileName, error: errorMessage });
          }
        }
      }
      console.log(`[INVOICE_BULK] Total entries collected: ${allEntries.length}`);
      if (allEntries.length === 0 && fileErrors.length === files.length) {
        throw AppError.badRequest(
          `No invoice data could be extracted from any of the ${files.length} file(s). Ensure the files are valid FatturaPA XML or PDF invoices.`,
          'NO_EXTRACTABLE_DATA',
        );
      }
      const llmCategoryClassifier = new LlmProductCategoryClassifier();
      const invoiceOtherNames = allEntries
        .filter((entry) => entry.productCategory === 'OTHER' && !entry.registrationNumber)
        .map((entry) => entry.productName);
      const invoiceLlmCategoryByName = await llmCategoryClassifier.classifyProductNames({
        productNames: invoiceOtherNames,
      });
      const suggestedProducts = allEntries.map((entry) => {
        const parsed = parseProductName(entry.productName);
        const normalizedName = resolveOfficialName(parsed.baseName);
        const resolvedCategory = resolveExtractedCategory({
          entryCategory: entry.productCategory,
          registrationNumber: entry.registrationNumber,
          productName: entry.productName,
          llmCategoryByName: invoiceLlmCategoryByName,
        });

        let effectiveQuantity = entry.quantity;
        let effectiveUnit = entry.quantityUnitOfMeasure;

        if (effectiveQuantity !== null && effectiveUnit && isPiecesUnit(effectiveUnit)) {
          const piecesConversion = convertPiecesToRealUnit(
            effectiveQuantity,
            effectiveUnit,
            entry.productName,
          );
          if (piecesConversion.converted) {
            effectiveQuantity = piecesConversion.quantity;
            effectiveUnit = piecesConversion.unitOfMeasure;
          }
        }

        const conversion = convertQuantityToCanonicalUnit(effectiveQuantity, effectiveUnit);
        return {
          productName: normalizedName,
          productNameExtracted: entry.productName.trim(),
          registrationNumber: entry.registrationNumber,
          productCategory: resolvedCategory,
          administrativeStatus: entry.administrativeStatus,
          quantity: entry.quantity,
          quantityUnitOfMeasure: entry.quantityUnitOfMeasure,
          quantityConverted: conversion?.quantityConverted ?? entry.quantity,
          unitMeasureConverted: conversion?.unitMeasureConverted ?? entry.quantityUnitOfMeasure,
          quantityExtractedInProductName: parsed.packagingQuantity,
          quantityExtractedInProductNameUnit: parsed.packagingUnit,
          supplierName: entry.supplierName,
          supplierVat: entry.supplierVat,
          invoiceNumber: entry.invoiceNumber,
          invoiceDate: entry.invoiceDate,
          invoiceDueDate: entry.invoiceDueDate,
          unitPrice: entry.unitPrice,
          totalPrice: entry.totalPrice,
        };
      });
      console.log(`[INVOICE_BULK] Mapped ${suggestedProducts.length} products before enrichment`);
      const enrichedProducts =
        productRegistrationLookupServiceSingleton.enrichProductsWithRegistration(suggestedProducts);
      const groupedProductsService = new GroupInvoiceSuggestedProductsWithStocksService();
      const suggestedProductsWithStocks = groupedProductsService.execute({
        products: enrichedProducts,
      });
      console.log(`[INVOICE_BULK] After enrichment: ${enrichedProducts.length} products`);
      const responseData = {
        status: 'success' as const,
        data: {
          suggestedProducts: enrichedProducts,
          suggestedProductsWithStocks,
          totalEntries: allEntries.length,
          filesProcessed: files.length,
          filesWithErrors: fileErrors.length > 0 ? fileErrors : undefined,
        },
      };
      return response.status(200).json(responseData);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : 'Unknown error during invoice extraction';
      console.error(`[INVOICE_BULK] Extraction error: ${message}`, error);
      throw AppError.internal(message, 'INVOICE_EXTRACTION_ERROR');
    } finally {
      for (const tempFile of tempFiles) {
        if (fs.existsSync(tempFile)) {
          fs.rmSync(tempFile);
        }
      }
    }
  }

  async importFromCsvExcel(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const file = request.file;
    if (!file) {
      throw AppError.badRequest('No file uploaded', 'NO_FILE');
    }

    const { companyId, warehouseId, sourceFileId } = request.body as {
      companyId: string;
      warehouseId?: string;
      sourceFileId?: string;
    };
    const preview =
      String(request.query.preview ?? request.body.preview ?? '').toLowerCase() === 'true';

    if (!companyId) {
      throw AppError.badRequest('companyId is required', 'MISSING_COMPANY_ID');
    }

    if (!this.stockRepository || !this.warehouseRepository || !this.prisma) {
      throw AppError.internal('Required dependencies not initialized', 'MISSING_DEPENDENCIES');
    }

    const useCase = new ImportProductsFromCsvExcelUseCase(
      this.productRepository,
      this.stockRepository,
      this.warehouseRepository,
    );

    const result = await useCase.execute({
      companyId,
      warehouseId,
      sourceFileId,
      fileBuffer: file.buffer,
      fileName: file.originalname,
      preview,
    });

    if (preview) {
      return response.status(200).json({
        status: 'success',
        data: {
          products: result.previewProducts ?? [],
          errors: result.errors,
        },
      });
    }

    if (result.productIds.length > 0) {
      try {
        const labelQueue = getProductLabelMatchingQueue();
        await labelQueue.addJob({ productIds: result.productIds });
      } catch (queueError) {
        console.error('[PRODUCT-CONTROLLER] Failed to queue label matching job:', queueError);
      }
    }

    return response.status(200).json({
      status: 'success',
      data: {
        productsCreated: result.productsCreated,
        productsUpdated: result.productsUpdated,
        stocksCreated: result.stocksCreated,
        errors: result.errors,
      },
    });
  }

  async updateAdministrativeStatus(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const fitosanitariService = FitosanitariLookupService.getInstance();

    const allProducts = await this.productRepository.findAllByUserId(request.user.id);

    const updates: Array<{ id: string; administrativeStatus: string | null }> = [];
    for (const product of allProducts) {
      if (product.category !== ProductCategory.PESTICIDE) {
        updates.push({ id: product.id, administrativeStatus: null });
        continue;
      }
      const status = fitosanitariService.lookupStatus(product.registrationNumber, product.name);
      updates.push({ id: product.id, administrativeStatus: status });
    }

    const count = await this.productRepository.updateAdministrativeStatusBulk(updates);

    return response.json({
      status: 'success',
      data: {
        productsUpdated: count,
        totalProducts: allProducts.length,
      },
    });
  }

  async downloadTemplate(_request: Request, response: Response): Promise<Response> {
    const headers = [
      // Product fields - Required
      'Nome prodotto',
      'SKU',
      // Product fields - Optional
      'Barcode',
      'Categoria',
      'Tipo',
      'Descrizione',
      'Numero registrazione',
      'URL etichetta',
      // Stock fields - Required
      'Quantità stock',
      'Unità di misura stock',
      'Codice DDT',
      'Data fattura',
      // Stock fields - Optional
      'Prezzo',
      'Unità di misura prezzo',
      'Tipo movimento',
      'Scadenza fattura',
      'Data DDT',
      'URL file DDT',
      'Codice fattura',
      'URL file fattura',
      'Nome fornitore',
      'Indirizzo fornitore',
      'Partita IVA fornitore',
    ];

    const exampleRow = [
      // Product - Required
      'Esempio Prodotto',
      'SKU-001',
      // Product - Optional
      '1234567890123',
      'FERTILIZER',
      'Generico',
      'Descrizione del prodotto',
      '12345',
      'https://example.com/label.pdf',
      // Stock - Required
      '100',
      'Kg',
      'DDT-001',
      '31/12/2024',
      // Stock - Optional
      '50.00',
      'EUR/kg',
      'IN',
      '15/01/2025',
      '30/12/2024',
      'https://example.com/ddt.pdf',
      'FATT-001',
      'https://example.com/invoice.pdf',
      'Fornitore S.r.l.',
      'Via Roma 1, 00100 Roma',
      'IT12345678901',
    ];

    const csvContent = [
      headers.join(';'),
      exampleRow.join(';'),
      '', // Empty row for user to fill
      '# Istruzioni:',
      '# - I campi obbligatori sono: Nome prodotto, SKU, Quantità stock, Unità di misura stock, Codice DDT, Data fattura',
      '# - Per i numeri decimali usa la virgola (es: 0,3 oppure 2400,5)',
      '# - Le date devono essere nel formato DD/MM/YYYY',
      '# - Le categorie disponibili sono: FERTILIZER, PESTICIDE, SEED, HARVEST, EQUIPMENT, PACKAGING',
      '# - Il tipo movimento può essere: IN (entrata) o OUT (uscita)',
      '# - Il campo Prezzo rappresenta costo acquisto se type=IN, prezzo vendita se type=OUT',
      '# - Usa il punto e virgola (;) come delimitatore per evitare problemi con i numeri decimali',
    ].join('\n');

    const filename = `template_importazione_prodotti_${new Date().toISOString().split('T')[0]}.csv`;

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf-8'));

    return response.send(csvContent);
  }

  async listVerifiedPhytosanitaryProducts(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const companyId = request.query.companyId as string | undefined;

    const useCase = new ListVerifiedPhytosanitaryProductsUseCase(this.productRepository);
    const result = await useCase.execute({
      userId: request.user.id,
      companyId,
    });

    return response.json({
      status: 'success',
      data: result,
    });
  }

  /**
   * Aligns (deduplicates) existing products by merging variants of the same base product.
   * Moves stocks from duplicates to the winner product and deletes duplicates.
   */
  async alignProducts(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { productIds, companyId } = request.body as {
      productIds?: string[];
      companyId?: string;
    };

    if (!companyId) {
      throw AppError.badRequest('companyId is required', 'MISSING_COMPANY_ID');
    }

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      throw AppError.badRequest(
        'productIds must be a non-empty array of product IDs',
        'INVALID_PRODUCT_IDS',
      );
    }

    if (!this.prisma) {
      throw AppError.internal('Database connection not available', 'DB_NOT_AVAILABLE');
    }

    const useCase = new AlignProductsUseCase(this.prisma);
    const result = await useCase.execute({ productIds, companyId });

    return response.json({
      status: 'success',
      data: result,
    });
  }

  async syncLabels(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    if (!this.prisma) {
      throw AppError.internal('Database connection not available', 'DB_NOT_AVAILABLE');
    }
    const body = (request.body ?? {}) as SyncProductLabelsRequest;
    if (
      !body.companyId &&
      !body.warehouseId &&
      (!body.productIds || body.productIds.length === 0)
    ) {
      throw AppError.badRequest(
        'At least one of companyId, warehouseId or productIds must be provided',
        'MISSING_SYNC_FILTER',
      );
    }
    const candidates = await this.findSyncCandidates(request.user.id, body);
    const eligibleIds = body.forceRefresh
      ? candidates.map((c) => c.id)
      : candidates.filter((c) => isStaleSummary(c.labelMetadata)).map((c) => c.id);
    if (eligibleIds.length === 0) {
      const payload: SyncProductLabelsResponse = { jobId: null, queued: 0 };
      return response.json({ status: 'success', data: payload });
    }
    const jobId = await getProductLabelMatchingQueue().addJob({
      productIds: eligibleIds,
      forceRefresh: body.forceRefresh === true,
    });
    const payload: SyncProductLabelsResponse = { jobId, queued: eligibleIds.length };
    return response.json({ status: 'success', data: payload });
  }

  private async findSyncCandidates(
    userId: string,
    filter: SyncProductLabelsRequest,
  ): Promise<Array<{ id: string; labelMetadata: unknown }>> {
    const productIdFilter =
      filter.productIds && filter.productIds.length > 0
        ? { in: [...filter.productIds] }
        : undefined;
    return this.prisma!.product.findMany({
      where: {
        id: productIdFilter,
        category: { in: [ProductCategory.PESTICIDE, ProductCategory.FERTILIZER] },
        warehouseId: filter.warehouseId,
        warehouse: {
          companyId: filter.companyId,
          company: { companyUsers: { some: { userId } } },
        },
      },
      select: { id: true, labelMetadata: true },
      take: 500,
    });
  }
}

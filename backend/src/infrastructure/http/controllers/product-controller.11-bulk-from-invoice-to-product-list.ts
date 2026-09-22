import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { ExtractDataFromInvoiceService } from '../../services/tool/extractDataFromInvoice';
import { InvoiceEntry } from '../../../domain/dtos/invoice-entry.dto';
import { productRegistrationLookupServiceSingleton } from '../../services/utils/ProductRegistrationLookupServiceSingleton';
import { GroupInvoiceSuggestedProductsWithStocksService } from '../../services/tool/group-invoice-suggested-products-with-stocks';
import { LlmProductCategoryClassifier } from '../../services/tool/llm-product-category-classifier';
import { parseProductName, resolveOfficialName, isPiecesUnit, convertPiecesToRealUnit } from '../../services/utils/ProductNameParser';
import { convertQuantityToCanonicalUnit } from '../../utils/quantityConversion';
import { resolveOcrProvider } from '../../services/ocr/ocr-provider';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ProductControllerContext } from './product-controller.context';
import { resolveExtractedCategory } from './product-controller.helpers';

export async function productControllerBulkFromInvoiceToProductList(this: ProductControllerContext, request: Request, response: Response): Promise<Response> {
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
